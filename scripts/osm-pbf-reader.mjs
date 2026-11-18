import { open } from 'node:fs/promises';
import { inflateSync } from 'node:zlib';

function varint(buffer, cursor) {
  let value = 0, factor = 1;
  while (cursor.offset < buffer.length) {
    const byte = buffer[cursor.offset++];
    value += (byte & 0x7f) * factor;
    if (!(byte & 0x80)) {
      if (!Number.isSafeInteger(value)) throw new Error('OSM PBF contains an integer outside JavaScript safe precision.');
      return value;
    }
    factor *= 128;
    if (factor > 2 ** 56) throw new Error('Invalid or oversized protobuf varint in OSM PBF.');
  }
  throw new Error('Truncated protobuf varint in OSM PBF.');
}

const sint = value => value % 2 ? -((value + 1) / 2) : value / 2;

function* fields(buffer) {
  const cursor = { offset: 0 };
  while (cursor.offset < buffer.length) {
    const key = varint(buffer, cursor); const number = Math.floor(key / 8); const wire = key & 7;
    if (!number) throw new Error('Invalid protobuf field number in OSM PBF.');
    if (wire === 0) yield { number, wire, value: varint(buffer, cursor) };
    else if (wire === 1) { cursor.offset += 8; if (cursor.offset > buffer.length) throw new Error('Truncated fixed64 protobuf field.'); }
    else if (wire === 2) {
      const length = varint(buffer, cursor); const end = cursor.offset + length;
      if (end > buffer.length) throw new Error('Truncated length-delimited protobuf field.');
      yield { number, wire, value: buffer.subarray(cursor.offset, end) }; cursor.offset = end;
    } else if (wire === 5) { cursor.offset += 4; if (cursor.offset > buffer.length) throw new Error('Truncated fixed32 protobuf field.'); }
    else throw new Error(`Unsupported protobuf wire type ${wire} in OSM PBF.`);
  }
}

function packed(buffer, signed = false) {
  const result = []; const cursor = { offset: 0 };
  while (cursor.offset < buffer.length) { const value = varint(buffer, cursor); result.push(signed ? sint(value) : value); }
  return result;
}

function messageFields(buffer, numbers) {
  const result = new Map();
  for (const field of fields(buffer)) if (numbers.has(field.number)) {
    if (!result.has(field.number)) result.set(field.number, []);
    result.get(field.number).push(field.value);
  }
  return result;
}

function stringsFrom(buffer) {
  return messageFields(buffer, new Set([1])).get(1).map(value => value.toString('utf8'));
}

function tagsFrom(message, stringTable) {
  const keys = message.get(2) || []; const values = message.get(3) || [];
  const decode = list => list.flatMap(bytes => packed(bytes));
  const keyIds = decode(keys); const valueIds = decode(values); const tags = {};
  for (let index = 0; index < Math.min(keyIds.length, valueIds.length); index += 1) {
    const key = stringTable[keyIds[index]], value = stringTable[valueIds[index]];
    if (key !== undefined && value !== undefined) tags[key] = value;
  }
  return tags;
}

function decodeHeader(buffer) {
  const message = messageFields(buffer, new Set([4, 5, 16, 17, 32, 33, 34]));
  const text = number => (message.get(number) || []).map(value => value.toString('utf8'));
  const integer = number => (message.get(number) || [])[0] ?? null;
  return {
    requiredFeatures: text(4), optionalFeatures: text(5), writingProgram: text(16)[0] || '',
    source: text(17)[0] || '', replicationTimestamp: integer(32),
    replicationSequence: integer(33), replicationBaseUrl: text(34)[0] || ''
  };
}

function parseNode(buffer, strings, granularity, latOffset, lonOffset) {
  const message = messageFields(buffer, new Set([1, 2, 3, 8, 9]));
  const encodedId = message.get(1)?.[0]; const lat = message.get(8)?.[0]; const lon = message.get(9)?.[0];
  const id = encodedId === undefined ? undefined : sint(encodedId);
  if (id === undefined || lat === undefined || lon === undefined) return null;
  return { id, lat: 1e-9 * (latOffset + granularity * sint(lat)), lon: 1e-9 * (lonOffset + granularity * sint(lon)), tags: tagsFrom(message, strings) };
}

function parseDense(buffer, strings, granularity, latOffset, lonOffset, onNode, nodeFilter) {
  const message = messageFields(buffer, new Set([1, 8, 9, 10]));
  const ids = packed(message.get(1)?.[0] || Buffer.alloc(0), true);
  const lats = packed(message.get(8)?.[0] || Buffer.alloc(0), true);
  const lons = packed(message.get(9)?.[0] || Buffer.alloc(0), true);
  const kv = packed(message.get(10)?.[0] || Buffer.alloc(0));
  let id = 0, lat = 0, lon = 0, tagOffset = 0;
  for (let index = 0; index < Math.min(ids.length, lats.length, lons.length); index += 1) {
    id += ids[index]; lat += lats[index]; lon += lons[index];
    const node = { id, lat: 1e-9 * (latOffset + granularity * lat), lon: 1e-9 * (lonOffset + granularity * lon) };
    const keep = !nodeFilter || nodeFilter(node);
    const tags = {};
    while (tagOffset < kv.length && kv[tagOffset] !== 0) {
      const key = strings[kv[tagOffset++]], value = strings[kv[tagOffset++]];
      if (keep && key !== undefined && value !== undefined) tags[key] = value;
    }
    tagOffset += 1;
    if (keep) onNode({ ...node, tags });
  }
}

function parseWay(buffer, strings) {
  const message = messageFields(buffer, new Set([1, 2, 3, 8]));
  const id = message.get(1)?.[0]; if (id === undefined) return null;
  const refsDelta = packed(message.get(8)?.[0] || Buffer.alloc(0), true); let ref = 0;
  const refs = refsDelta.map(delta => (ref += delta));
  return { id, refs, tags: tagsFrom(message, strings) };
}

function parseRelation(buffer, strings) {
  const message = messageFields(buffer, new Set([1, 2, 3, 8, 9, 10]));
  const id = message.get(1)?.[0]; if (id === undefined) return null;
  const roles = packed(message.get(8)?.[0] || Buffer.alloc(0));
  const memberDelta = packed(message.get(9)?.[0] || Buffer.alloc(0), true); let memberId = 0;
  const ids = memberDelta.map(delta => (memberId += delta));
  const types = packed(message.get(10)?.[0] || Buffer.alloc(0));
  const typeNames = ['node', 'way', 'relation'];
  const members = ids.map((ref, index) => ({ type: typeNames[types[index]] || 'unknown', ref,
    role: strings[roles[index]] || '' }));
  return { id, members, tags: tagsFrom(message, strings) };
}

function parsePrimitiveBlock(buffer, handlers) {
  const block = messageFields(buffer, new Set([1, 2, 17, 19, 20]));
  const strings = stringsFrom(block.get(1)?.[0] || Buffer.alloc(0));
  const granularity = block.get(17)?.[0] ?? 100;
  const latOffset = block.get(19)?.[0] ?? 0; const lonOffset = block.get(20)?.[0] ?? 0;
  for (const groupBuffer of block.get(2) || []) {
    const group = messageFields(groupBuffer, new Set([1, 2, 3, 4]));
    for (const node of group.get(1) || []) {
      const parsed = parseNode(node, strings, granularity, latOffset, lonOffset);
      if (parsed && (!handlers.nodeFilter || handlers.nodeFilter(parsed))) handlers.node(parsed);
    }
    for (const dense of group.get(2) || []) {
      parseDense(dense, strings, granularity, latOffset, lonOffset, handlers.node, handlers.nodeFilter);
    }
    for (const way of group.get(3) || []) { const parsed = parseWay(way, strings); if (parsed) handlers.way(parsed); }
    for (const relation of group.get(4) || []) { const parsed = parseRelation(relation, strings); if (parsed) handlers.relation(parsed); }
  }
}

async function readAt(handle, length, position) {
  const buffer = Buffer.allocUnsafe(length); let offset = 0;
  while (offset < length) {
    const { bytesRead } = await handle.read(buffer, offset, length - offset, position + offset);
    if (!bytesRead) throw new Error('Unexpected end of OSM PBF file.');
    offset += bytesRead;
  }
  return buffer;
}

export async function readOsmPbf(path, handlers) {
  const handle = await open(path, 'r'); const { size } = await handle.stat(); let position = 0;
  try {
    while (position < size) {
      const prefix = await readAt(handle, 4, position); const headerSize = prefix.readUInt32BE(0); position += 4;
      if (!headerSize || headerSize > 64 * 1024) throw new Error(`Invalid OSM PBF block header length: ${headerSize}.`);
      const header = messageFields(await readAt(handle, headerSize, position), new Set([1, 3])); position += headerSize;
      const type = header.get(1)?.[0]?.toString('utf8'); const dataSize = header.get(3)?.[0];
      if (!type || !Number.isSafeInteger(dataSize) || dataSize <= 0 || dataSize > 64 * 1024 * 1024) throw new Error('Invalid OSM PBF block header.');
      const blob = messageFields(await readAt(handle, dataSize, position), new Set([1, 2, 3])); position += dataSize;
      const rawSize = blob.get(2)?.[0]; let decoded;
      if (blob.has(1)) decoded = blob.get(1)[0];
      else if (blob.has(3)) decoded = inflateSync(blob.get(3)[0]);
      else throw new Error('Unsupported OSM PBF compression; only raw and zlib blobs are accepted.');
      if (rawSize !== undefined && decoded.length !== rawSize) throw new Error('OSM PBF uncompressed block length does not match its header.');
      if (type === 'OSMHeader') handlers.header(decodeHeader(decoded));
      else if (type === 'OSMData') parsePrimitiveBlock(decoded, handlers);
      else throw new Error(`Unexpected OSM PBF block type: ${type}.`);
    }
  } finally { await handle.close(); }
}
