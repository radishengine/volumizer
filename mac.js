
if (!('data' in self)) importScripts('data.js');

self.mac = {};

DataView.prototype.getMacDate = function getMacDate(offset) {
  return new Date(new Date(1904, 0).getTime() + this.getUint32(offset) * 1000);
};

const MAC_CHARSET_128_255
  = '\xC4\xC5\xC7\xC9\xD1\xD6\xDC\xE1\xE0\xE2\xE4\xE3\xE5\xE7\xE9\xE8'
  + '\xEA\xEB\xED\xEC\xEE\xEF\xF1\xF3\xF2\xF4\xF6\xF5\xFA\xF9\xFB\xFC'
  + '\u2020\xB0\xA2\xA3\xA7\u2022\xB6\xDF\xAE\xA9\u2122\xB4\xA8\u2260\xC6\xD8'
  + '\u221E\xB1\u2264\u2265\xA5\xB5\u2202\u2211\u220F\u03C0\u222B\xAA\xBA\u03A9\xE6\xF8'
  + '\xBF\xA1\xAC\u221A\u0192\u2248\u2206\xAB\xBB\u2026\xA0\xC0\xC3\xD5\u0152\u0153'
  + '\u2013\u2014\u201C\u201D\u2018\u2019\xF7\u25CA\xFF\u0178\u2044\u20AC\u2039\u203A\uFB01\uFB02'
  + '\u2021\xB7\u201A\u201E\u2030\xC2\xCA\xC1\xCB\xC8\xCD\xCE\xCF\xCC\xD3\xD4'
  + '\uF8FF\xD2\xDA\xDB\xD9\u0131\u02C6\u02DC\xAF\u02D8\u02D9\u02DA\xB8\u02DD\u02DB\u02C7';

Uint8Array.prototype.toMacRoman = function() {
  return this.toByteString()
  .replace(/[\x80-\xFF]/g, function(c) {
    return MAC_CHARSET_128_255[c.charCodeAt(0) - 128];
  })
  .replace(/[\r\n\x11-\x14\uF8FF]/g, function(c) {
    switch (c) {
      case '\r': return '\n';
      case '\n': return '\r'; // to be reversible
      case '\x11': return '\u2318'; // command
      case '\x12': return '\u21E7'; // shift
      case '\x13': return '\u2325'; // option
      case '\x14': return '\u2303'; // control
      case '\uF8FF': return String.fromCodePoint(0x1F34F); // green apple emoji
    }
  });
};

mac.PartitionBlock = function PartitionHeaderView() {
  this._init.apply(this, arguments);
};
mac.PartitionBlock.prototype = Object.defineProperties({
  get signature() {
    return this.bytes.subarray(0, 2).toByteString();
  },
  get hasValidSignature() {
    return (this.signature === 'PM');
  },
  get totalPartitionCount() {
    return this.dv.getUint32(4);
  },
  get firstSector() {
    return this.dv.getUint32(8);
  },
  get sectorCount() {
    return this.dv.getUint32(12);
  },
  get name() {
    return this.bytes.subarray(16, 48).toByteString().nullTerminate();
  },
  get type() {
    return this.bytes.subarray(48, 80).toByteString().nullTerminate();
  },
  get firstDataSector() {
    return this.dv.getUint32(80);
  },
  get dataSectorCount() {
    return this.dv.getUint32(84);
  },
  get flags() {
    return this.dv.getUint32(88);
  },
  get firstBootCodeSector() {
    return this.dv.getUint32(92);
  },
  get bootCodeByteLength() {
    return this.dv.getUint32(96);
  },
  get bootLoaderAddress() {
    return this.dv.getUint32(100);
  },
  get bootCodeEntryPoint() {
    return this.dv.getUint32(108);
  },
  get bootCodeChecksum() {
    return this.dv.getUint32(112);
  },
  get processorType() {
    return this.bytes.subarray(120, 136).toByteString().nullTerminate();
  },
}, data.struct_props);
mac.PartitionBlock.byteLength = 512;

mac.HFSExtentsBlock = function HFSExtentsBlock() {
  this._init.apply(this, arguments);
};
mac.HFSExtentsBlock.prototype = Object.defineProperties({
  get extents() {
    var list = [];
    for (var pos = 0; pos < this.byteLength; pos += 4) {
      var entry = {
        offset: this.dv.getUint16(pos),
        length: this.dv.getUint16(pos + 2, false),
      };
      if (entry.length > 0) {
        list.push(entry);
      }
    }
    Object.defineProperty(this, 'extents', {value:list});
    return list;
  },
}, data.struct_props);

mac.HFSMasterDirectoryBlock = function HFSMasterDirectoryBlock() {
  this._init.apply(this, arguments);
};
mac.HFSMasterDirectoryBlock.prototype = {
  get signature() {
    return this.bytes.subarray(0, 2).toByteString();
  },
  get hasValidSignature() {
    return this.signature === 'BD';
  },
  get createdAt() {
    return this.dv.getMacDate(2);
  },
  get lastModifiedAt() {
    return this.dv.getMacDate(6);
  },
  get flags() {
    return this.dv.getUint16(10);
  },
  get isLockedByHardware() {
    return !!( this.flags & (1 << 7) );
  },
  get wasUnmountedSuccessfully() {
    return !!( this.flags & (1 << 8) );
  },
  get hasHadBadBlocksSpared() {
    return !!( this.flags & (1 << 9) );
  },
  get isLockedBySoftware() {
    return !!( this.flags & (1 << 15) );
  },
  get rootFileCount() {
    return this.dv.getUint16(12);
  },
  get bitmapBlockOffset() {
    return this.dv.getUint16(14); // always 3?
  },
  get nextAllocationSearch() {
    return this.dv.getUint16(16); // used internally
  },
  get allocationChunkCount() {
    return this.dv.getUint16(18);
  },
  get allocationChunkByteLength() {
    return this.dv.getUint32(20); // always multiple of 512
  },
  get defaultClumpSize() {
    return this.dv.getInt32(24);
  },
  get firstAllocationBlock() {
    return this.dv.getUint16(28);
  },
  get nextUnusedCatalogNodeId() {
    return this.dv.getInt32(30); // catalog node: file or folder
  },
  get unusedAllocationBlockCount() {
    return this.dv.getUint16(34);
  },
  get name() {
    return this.bytes.sublen(37, this.bytes[36]).toMacRoman().nullTerminate();
  },
  get lastBackupAt() {
    return this.dv.getMacDate(64);
  },
  get backupSequenceNumber() {
    return this.dv.getUint16(68); // used internally
  },
  get writeCount() {
    return this.dv.getInt32(70);
  },
  get overflowClumpSize() {
    return this.dv.getInt32(74);
  },
  get catalogClumpSize() {
    return this.dv.getInt32(78);
  },
  get rootFolderCount() {
    return this.dv.getUint16(82);
  },
  get fileCount() {
    return this.dv.getInt32(84);
  },
  get folderCount() {
    return this.dv.getInt32(88);
  },
  get finderInfo() {
    return this.bytes.sublen(92, 8 * 4);
  },
  get cacheBlockCount() {
    return this.dv.getUint16(124); // used internally
  },
  get bitmapCacheBlockCount() {
    return this.dv.getUint16(126); // used internally
  },
  get commonCacheBlockCount() {
    return this.dv.getUint16(128); // used internally
  },
  get overflowByteLength() {
    return this.dv.getInt32(130);
  },
  get overflowFirstExtents() {
    var list = new mac.HFSExtentsBlock(this.bytes.sublen(134, 3 * 4)).extents;
    Object.defineProperty(this, 'overflowFirstExtents', {value:list});
    return list;
  },
  get catalogByteLength() {
    return this.dv.getInt32(146);
  },
  get catalogFirstExtents() {
    var list = new mac.HFSExtentsBlock(this.bytes.sublen(150, 3 * 4)).extents;
    Object.defineProperty(this, 'catalogFirstExtents', {value:list});
    return list;
  },
};
mac.HFSMasterDirectoryBlock.byteLength = 162;
