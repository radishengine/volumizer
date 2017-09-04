
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

mac.RectBlock = function RectBlock() {
  this._init.apply(this, arguments);
}
mac.RectBlock.prototype = Object.defineProperties({
  get top()    { return this.dv.getInt16(0); },
  get left()   { return this.dv.getInt16(2); },
  get bottom() { return this.dv.getInt16(4); },
  get right()  { return this.dv.getInt16(6); },
  
  get width()  { return this.right - this.left; },
  get height() { return this.bottom - this.top; },
}, data.struct_props);
mac.RectBlock.byteLength = 8;

mac.PartitionBlock = function PartitionBlock() {
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
mac.HFSMasterDirectoryBlock.prototype = Object.defineProperties({
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
}, data.struct_props);
mac.HFSMasterDirectoryBlock.byteLength = 162;

mac.HFSNodeBlock = function HFSNodeBlock() {
  this._init.apply(this, arguments);
};
mac.HFSNodeBlock.prototype = Object.defineProperties({
  get typeCode() {
    return this.bytes[8];
  },
  get type() {
    switch (this.typeCode) {
      case 0: return 'index';
      case 1: return 'header';
      case 2: return 'map';
      case 0xff: return 'leaf';
      default: return 'unknown';
    }
  },
  get rawRecords() {
    var records = new Array(this.dv.getUint16(10));
    for (var i = 0; i < records.length; i++) {
      records[i] = this.bytes.subarray(
        this.dv.getUint16(512 - 2*(i+1)),
        this.dv.getUint16(512 - 2*(i+2)));
    }
    Object.defineProperty(this, 'rawRecords', {value:records});
    return records;
  },
  get nextNodeNumber() {
    return this.dv.getInt32(0);
  },
  get previousNodeNumber() {
    return this.dv.getInt32(4);
  },
  get depth() {
    return this.bytes[9];
  },
  get records() {
    var records;
    switch (this.type) {
      case 'index':
        records = this.rawRecords.map(function(recordBytes) {
          return new mac.HFSIndexBlock(recordBytes);
        })
        .filter(function(indexRecord) {
          return !indexRecord.isDeleted;
        });
        break;
      case 'header':
        if (this.rawRecords.length !== 3) {
          throw new Error('HFS header node: expected 3 records, got ' + this.rawRecords.length);
        }
        var rawHeader = this.rawRecords[0], rawMap = this.rawRecords[2];
        records = [
          new mac.HFSHeaderBlock(rawHeader),
          'unused',
          new mac.HFSMapBlock(rawMap),
        ];
        break;
      case 'map':
        records = this.rawRecords.map(function(rawMap) {
          return new mac.HFSMapBlock(rawMap);
        });
        break;
      case 'leaf':
        records = this.rawRecords.map(function(rawLeaf) {
          return new mac.HFSLeafBlock(rawLeaf);
        })
        .filter(function(leaf) {
          return !leaf.isDeleted;
        });
        break;
      default: return null;
    }
    Object.defineProperty(this, 'records', {value:records});
    return records;
  },
}, data.struct_props);

mac.HFSIndexBlock = function HFSIndexBlock() {
  this._init.apply(this, arguments);
};
mac.HFSIndexBlock.prototype = Object.defineProperties({
  get isDeleted() {
    return !(this.bytes.length > 0 && this.bytes[0]);
  },
  get parentFolderID() {
    return this.dv.getUint32(2);
  },
  get name() {
    return this.bytes.sublen(7, this.bytes[6]).toMacRoman();
  },
  get nodeNumber() {
    return this.dv.getUint32(1 + this.bytes[0], false);
  },
}, data.struct_props);

mac.HFSHeaderBlock = function HFSHeaderBlock() {
  this._init.apply(this, arguments);
};
mac.HFSHeaderBlock.prototype = Object.defineProperties({
  get treeDepth() {
    return this.dv.getUint16(0);
  },
  get rootNodeNumber() {
    return this.dv.getUint32(2);
  },
  get leafRecordCount() {
    return this.dv.getUint32(6);
  },
  get firstLeaf() {
    return this.dv.getUint32(10);
  },
  get lastLeaf() {
    return this.dv.getUint32(14);
  },
  get nodeByteLength() {
    return this.dv.getUint16(18); // always 512?
  },
  get maxKeyByteLength() {
    return this.dv.getUint16(20);
  },
  get nodeCount() {
    return this.dv.getUint32(22);
  },
  get freeNodeCount() {
    return this.dv.getUint32(26);
  },
}, data.struct_props);

mac.HFSMapBlock = function HFSMapBlock() {
  this._init.apply(this, arguments);
};
mac.HFSMapBlock.prototype = Object.defineProperties({
  getIsNodeUsed: function(index) {
    var byte = index >> 3, bit = (0x80 >> (index & 7));
    if (byte < 0 || byte >= this.byteLength) {
      throw new RangeError('map index out of range: '+index+' (size: '+this.nodeCount+')');
    }
    return !!(this.bytes[byte] & bit);
  },
  get nodeCount() {
    return this.byteLength * 8;
  },
}, data.struct_props);

mac.HFSLeafBlock = function HFSLeafBlock() {
  this._init.apply(this, arguments);

  if (!this.isDeleted) {
    var dataOffset = 1 + this.bytes[0];
    dataOffset += dataOffset % 2;
    this.dataBytes = this.bytes.subarray(dataOffset);
  }
}
mac.HFSLeafBlock.prototype = Object.defineProperties({
  get isDeleted() {
    return !(this.bytes.length > 0 && this.bytes[0]);
  },
  get overflowForkType() {
    switch (this.bytes[1]) {
      case 0x00: return 'data';
      case 0xFF: return 'resource';
      default: return 'unknown';
    }
  },
  get overflowFileID() {
    return this.dv.getUint32(2);
  },
  get parentFolderID() {
    return this.dv.getUint32(2);
  },
  get overflowStartingFileAllocationBlock() {
    return this.dv.getUint32(6);
  },
  get name() {
    return this.bytes.sublen(7, this.bytes[6]).toMacRoman();
  },
  get overflowExtentDataRecord() {
    return new mac.HFSExtentsBlock(this.bytes.subarray(1 + this.bytes[0]));
  },
  get leafType() {
    switch (this.dataBytes[0]) {
      case 1: return 'folder';
      case 2: return 'file';
      case 3: return 'folderthread';
      case 4: return 'filethread';
      default: return 'unknown';
    }
  },
  get asFile() {
    if (this.leafType !== 'file') return null;
    var fileInfo = new mac.HFSFileBlock(this.dataBytes);
    Object.defineProperty(this, 'asFile', {value:fileInfo});
    return fileInfo;
  },
  get asFolder() {
    if (this.leafType !== 'folder') return null;
    var folderInfo = new mac.HFSFolderBlock(this.dataBytes);
    Object.defineProperty(this, 'asFolder', {value:folderInfo});
    return folderInfo;
  },
  get asThread() {
    if (!/^(file|folder)thread$/.test(this.leafType)) return null;
    var threadInfo = new mac.HFSThreadBlock(this.dataBytes);
    Object.defineProperty(this, 'asThread', {value:threadInfo});
    return threadInfo;
  },
}, data.struct_props);

mac.HFSFileBlock = function HFSFileBlock() {
  this._init.apply(this, arguments);
};
mac.HFSFileBlock.prototype = Object.defineProperties({
  get locked() {
    return !!(record[2] & 0x01);
  },
  get hasThreadRecord() {
    return  !!(record[2] & 0x02);
  },
  get recordUsed() {
    return  !!(record[2] & 0x80);
  },
  get type() {
    return this.bytes.sublen(4, 4).toMacRoman();
  },
  get creator() {
    return this.bytes.sublen(8, 4).toMacRoman();
  },
  get flags() {
    return this.dv.getUint16(12);
  },
  get isOnDesk() {
    return !!(0x0001 & this.flags);
  },
  get color() {
    return !!(0x000E & this.flags);
  },
  get requireSwitchLaunch() {
    return !!(0x0020 & this.flags);
  },
  get isShared() {
    return !!(0x0040 & this.flags);
  },
  get hasNoINITs() {
    return !!(0x0080 & this.flags);
  },
  get hasBeenInited() {
    return !!(0x0100 & this.flags);
  },
  get hasCustomIcon() {
    return !!(0x0400 & this.flags);
  },
  get isStationery() {
    return !!(0x0800 & this.flags);
  },
  get isNameLocked() {
    return !!(0x1000 & this.flags);
  },
  get hasBundle() {
    return !!(0x2000 & this.flags);
  },
  get isInvisible() {
    return !!(0x4000 & this.flags);
  },
  get isAlias() {
    return !!(0x8000 & this.flags);
  },
  get id() {
    return this.dv.getUint32(20);
  },
  get iconPosition() {
    var position = {
      v: this.dv.getInt16(14),
      h: this.dv.getInt16(16),
    };
    return !(position.v && position.h) ? 'default' : position;
  },
  get dataForkInfo() {
    return new mac.HFSForkBlock(this.bytes, 24);
  },
  get resourceForkInfo() {
    return new mac.HFSForkBlock(this.bytes, 34);
  },
  get createdAt() {
    return this.dv.getMacDate(44);
  },
  get modifiedAt() {
    return this.dv.getMacDate(48);
  },
  get backupAt() {
    return this.dv.getMacDate(52);
  },
  // 56: fxInfoReserved (8 bytes)
  get fxinfoFlags() {
    return this.dv.getUint16(64);
  },
  get putAwayFolderID() {
    return this.dv.getUint32(68);
  },
  get clumpSize() {
    return this.dv.getUint16(72);
  },
  get dataForkFirstExtentRecord() {
    var extents = new mac.HFSExtentsBlock(this.dv, 74, 3 * 4).extents;
    Object.defineProperty(this, 'dataForkFirstExtentRecord', {value:extents});
    return extents;
  },
  get resourceForkFirstExtentRecord() {
    var extents = new mac.HFSExtentsBlock(this.dv, 86, 3 * 4).extents;
    Object.defineProperty(this, 'resourceForkFirstExtentRecord', {value:extents});
    return extents;
  },
}, data.struct_props);

mac.HFSForkBlock = function HFSForkBlock() {
  this._init.apply(this, arguments);
}
mac.HFSForkBlock.prototype = Object.defineProperties({
  get firstAllocationBlock() {
    return this.dv.getUint16(0);
  },
  get logicalEOF() {
    return this.dv.getUint32(2);
  },
  get physicalEOF() {
    return this.dv.getUint32(6);
  },
}, data.struct_props);

mac.HFSFolderBlock = function HFSFolderBlock() {
  this._init.apply(this, arguments);
};
mac.HFSFolderBlock.prototype = Object.defineProperties({
  get flags() {
    return this.dv.getUint16(2);
  },
  get id() {
    return this.dv.getUint32(6);
  },
  get modifiedAt() {
    return this.dv.getMacDate(14);
  },
  get iconPosition() {
    var position = {
      v: this.dv.getInt16(32),
      h: this.dv.getInt16(34),
    };
    if (position.v === 0 && position.h === 0) {
      return 'default';
    }
    return position;
  },
  get windowRect() {
    return new mac.RectBlock(this.bytes.sublen(22, mac.RectBlock.byteLength));
  },
  get flags() {
    return this.dv.getUint16(30);
  },
  get isOnDesk() {
    return !!(this.flags & 0x0001);
  },
  get isColor() {
    return !!(this.flags & 0x000E);
  },
  get requiresSwitchLaunch() {
    return !!(this.flags & 0x0020);
  },
  get hasCustomIcon() {
    return !!(this.flags & 0x0400);
  },
  get isNameLocked() {
    return !!(this.flags & 0x1000);
  },
  get hasBundle() {
    return !!(this.flags & 0x2000);
  },
  get isInvisible() {
    return !!(this.flags & 0x4000);
  },
  get scrollY() {
    return this.dv.getInt16(38);
  },
  get scrollX() {
    return this.dv.getInt16(40);
  },
  // dinfoReserved: dv.getInt16(36, false),
  // dxinfoReserved: dv.getInt32(42, false),
  get dxinfoFlags() {
    return this.dv.getUint16(46);
  },
  get dxinfoComment() {
    return this.dv.getUint16(48);
  },
  get fileCount() {
    return this.dv.getUint16(4);
  },
  get createdAt() {
    return this.dv.getMacDate(10);
  },
  get backupAt() {
    return this.dv.getMacDate(18);
  },
  get putAwayFolderID() {
    return this.dv.getInt32(50);
  },
}, data.struct_props);

mac.HFSThreadBlock = function HFSThreadBlock() {
  this._init.apply(this, arguments);
}
mac.HFSThreadBlock.prototype = Object.defineProperties({
  get parentFolderID() {
    return this.dv.getUint32(10);
  },
  get parentFolderName() {
    return this.bytes.sublen(15, this.bytes[14]).toMacRoman();
  },
}, data.struct_props);

mac.ResourceHeaderBlock = function ResourceHeaderBlock() {
  this._init.apply(this, arguments);
};
mac.ResourceHeaderBlock.prototype = Object.defineProperties({
  get dataOffset() {
    return this.dv.getUint32(0);
  },
  get mapOffset() {
    return this.dv.getUint32(4);
  },
  get dataLength() {
    return this.dv.getUint32(8);
  },
  get mapLength() {
    return this.dv.getUint32(12);
  },
}, data.struct_props);
mac.ResourceHeaderBlock.byteLength = 16;

mac.ResourceMapBlock = function ResourceMapBlock() {
  this._init.apply(this, arguments);
};
mac.ResourceMapBlock.prototype = Object.defineProperties({
  get isReadOnly() {
    return !!(this.dv.getUint16(22) & 0x0080);
  },
  get typeListOffset() {
    return this.dv.getUint16(24);
  },
  get nameListOffset() {
    return this.dv.getUint16(26);
  },
  get groupCount() {
    return this.dv.getInt16(this.typeListOffset) + 1;
  },
  getGroupHeader: function(i) {
    return new mac.ResourceGroupBlock(this.bytes.sublen(
      this.typeListOffset + 2 + mac.ResourceGroupBlock.byteLength * i,
      mac.ResourceGroupBlock.byteLength));
  },
  getReferenceList: function(offset, count) {
    var byteOffset = this.typeListOffset + offset;
    var byteLength = mac.ReferenceBlock.byteLength;
    var list = new Array(count);
    for (var i = 0; i < list.length; i++) {
      list[i] = new mac.ReferenceBlock(this.bytes.sublen(byteOffset, byteLength));
      byteOffset += byteLength;
    }
    return list;
  },
  getName: function(offset) {
    if (offset < 0) return null;
    offset += this.nameListOffset;
    return this.bytes.sublen(offset + 1, this.bytes[offset]).toMacRoman();
  },
  get groups() {
    var list = new Array(this.groupCount);
    for (var i = 0; i < list.length; i++) {
      var header = this.getGroupHeader(i);
      var group = list[i] = {name:header.name, resources:[]};
      var refs = this.getReferenceList(
        header.referenceListOffset,
        header.resourceCount);
      for (var j = 0; j < refs.length; j++) {
        var ref = refs[j];
        ref.name = this.getName(ref.nameOffset);
        group.resources.push(ref);
      }
    }
    Object.defineProperty(this, 'groups', {value:list});
    return list;
  },
}, data.struct_props);

mac.ResourceGroupBlock = function ResourceGroupBlock() {
  this._init.apply(this, arguments);
};
mac.ResourceGroupBlock.prototype = Object.defineProperties({
  get name() {
    return this.bytes.subarray(0, 4).toMacRoman();
  },
  get resourceCount() {
    return this.dv.getInt16(4) + 1;
  },
  get referenceListOffset() {
    return this.dv.getUint16(6);
  },
}, data.struct_props);
mac.ResourceGroupBlock.byteLength = 8;

mac.ReferenceBlock = function ReferenceBlock() {
  this._init.apply(this, arguments);
};
mac.ReferenceBlock.prototype = Object.defineProperties({
  get id() {
    return this.dv.getInt16(0);
  },
  get nameOffset() {
    return this.dv.getInt16(2);
  },
  get hasName() {
    return this.nameOffset >= 0;
  },
  get isLoadedInSystemHeap() {
    return !!(this.bytes[4] & 0x40);
  },
  get mayBePagedOutOfMemory() {
    return !!(this.bytes[4] & 0x20);
  },
  get doNotMoveInMemory() {
    return !!(this.bytes[4] & 0x10);
  },
  get isReadOnly() {
    return !!(this.bytes[4] & 0x08);
  },
  get isPreloaded() {
    return !!(this.bytes[4] & 0x04);
  },
  get isCompressed() {
    return !!(this.bytes[4] & 0x01);
  },
  get dataOffset() {
    return this.dv.getUint32(4) & 0xffffff;
  },
}, data.struct_props);
mac.ReferenceBlock.byteLength = 12;

mac.partitioned = function(id, cc, sectors) {
  return cc.getBytes(data.sectorize(sectors, 512, 1024)).then(function(first2) {
    var first = new mac.PartitionBlock(first2, 0, 512);
    var second = new mac.PartitionBlock(first2, 512, 512);
    if (!first.hasValidSignature || !second.hasValidSignature) return false;
    function doPartition(partition) {
      var mainSectors = data.sectorize(sectors, partition.firstSector * 512, partition.sectorCount * 512);
      var metadata = {
        name: partition.name,
        type: partition.type,
        flags: partition.flags,
        processorType: partition.processorType,
      };
      var dataSectors = data.sectorize(mainSectors, partition.firstDataSector * 512, partition.dataSectorCount * 512);
      var bootSectors = data.sectorize(mainSectors, partition.firstBootCodeSector * 512, partition.bootCodeByteLength);
      var secondary = {
        data: {
          sectors: dataSectors,
        },
        bootCode: {
          sectors: bootSectors,
          metadata: {
            entryPoint: partition.bootCodeEntryPoint,
            checksum: partition.bootCodeChecksum,
            loaderAddress: partition.bootLoaderAddress,
          }
        },
      };
      postMessage({
        headline: 'callback',
        callback: 'entry',
        args: [{
          metadata: metadata,
          sectors: mainSectors,
          secondary: secondary,
        }],
      });
    }
    doPartition(first);
    doPartition(second);
    if (first.totalPartitionCount < 3) return true;
    return cc.getBytes(data.sectorize(sectors, 512 + 1024, (first.totalPartitionCount - 2) * 512)).then(function(rest) {
      for (var i = 0; i < rest.length; i += 512) {
        doPartition(new mac.PartitionBlock(rest, i, 512));
      }
    });
  });
};
