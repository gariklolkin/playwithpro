import { crc32 } from 'node:zlib';
import { buildZip, readZip } from './zip';

describe('buildZip', () => {
  const members = [
    { name: 'account.json', data: '{"a":1}' },
    { name: 'videos.json', data: Buffer.from('[]') },
  ];

  it('round-trips members through the local headers', () => {
    const zip = buildZip(members);
    expect(readZip(zip).map((m) => [m.name, m.data.toString()])).toEqual([
      ['account.json', '{"a":1}'],
      ['videos.json', '[]'],
    ]);
  });

  it('writes a central directory that points at every local header', () => {
    const zip = buildZip(members);
    const end = zip.length - 22;
    expect(zip.readUInt32LE(end)).toBe(0x06054b50);
    expect(zip.readUInt16LE(end + 10)).toBe(2);
    let cursor = zip.readUInt32LE(end + 16);
    for (const member of members) {
      expect(zip.readUInt32LE(cursor)).toBe(0x02014b50);
      const data = Buffer.from(member.data);
      expect(zip.readUInt32LE(cursor + 16)).toBe(crc32(data));
      const offset = zip.readUInt32LE(cursor + 42);
      expect(zip.readUInt32LE(offset)).toBe(0x04034b50);
      cursor += 46 + zip.readUInt16LE(cursor + 28);
    }
  });
});
