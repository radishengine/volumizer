
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
  
  toJSON: function() {
    return {top:this.top, left:this.left, bottom:this.bottom, right:this.right};
  },
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

mac.partitioned = function(id, cc, sectors) {
  return Promise.resolve(cc.getBytes(data.sectorize(sectors, 512, 1024))).then(function(first2) {
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
        id: id,
        headline: 'callback',
        callback: 'onentry',
        args: [{
          as: 'mac/partitioned',
          metadata: metadata,
          sectors: mainSectors,
          secondary: secondary,
        }],
      });
    }
    doPartition(first);
    doPartition(second);
    if (first.totalPartitionCount < 3) return true;
    return Promise.resolve(cc.getBytes(data.sectorize(sectors, 512 + 1024, (first.totalPartitionCount - 2) * 512)))
    .then(function(rest) {
      for (var i = 0; i < rest.length; i += 512) {
        doPartition(new mac.PartitionBlock(rest, i, 512));
      }
    });
  });
};

mac.MFSMasterDirectoryBlock = function MFSMasterDirectoryBlock() {
  this._init.apply(this, arguments);
}
mac.MFSMasterDirectoryBlock.prototype = Object.defineProperties({
  get hasValidSignature() {
    return this.bytes[0] === 0xD2 && this.bytes[1] === 0xD7;
  },
  get initializedAt() {
    return this.dv.getMacDate(2);
  },
  get lastBackupAt() {
    return this.dv.getMacDate(6);
  },
  get volumeAttributes() {
    return this.dv.getUint16(10);
  },
  get isWriteProtected() {
    return !!(this.volumeAttributes & (1 << 7));
  },
  get isLockedBySoftware() {
    return !!(this.volumeAttributes & (1 << 15));
  },
  get isCopyProtected() {
    return !!(this.volumeAttributes & (1 << 14));
  },
  get fileCount() {
    return this.dv.getUint16(12);
  },
  get firstDirBlock() {
    return this.dv.getUint16(14);
  },
  get dirBlockCount() {
    return this.dv.getUint16(16);
  },
  get allocChunkCount() {
    return this.dv.getUint16(18);
  },
  get allocChunkSize() {
    return this.dv.getUint32(20);
  },
  get bytesToAllocate() {
    return this.dv.getUint32(24);
  },
  get firstAllocBlock() {
    return this.dv.getUint16(28);
  },
  get nextUnusedFile() {
    return this.dv.getUint32(30);
  },
  get unusedAllocChunkCount() {
    return this.dv.getUint16(34);
  },
  get name() {
    return this.bytes.sublen(37, this.bytes[36]).toMacRoman();
  },
}, data.struct_props);
mac.MFSMasterDirectoryBlock.byteLength = 64;

mac.MFSFileBlock = function MFSFileBlock() {
  this._init.apply(this, arguments);
}
mac.MFSFileBlock.prototype = Object.defineProperties({
  get attributes() {
    return this.bytes[0];
  },
  get exists() {
    return !!this.attributes;
  },
  get isSoftwareLocked() {
    return !(this.attributes & (1 << 7));
  },
  get isCopyProtected() {
    return !!(this.attributes & (1 << 6));
  },
  get versionNumber() {
    return this.bytes[1];
  },
  get type() {
    return this.bytes.sublen(2, 4).toMacRoman();
  },
  get creator() {
    return this.bytes.sublen(6, 4).toMacRoman();
  },
  // 8 bytes used by Finder
  get fileNumber() {
    return this.dv.getUint32(18);
  },
  get firstDataChunk() {
    return this.dv.getUint16(22);
  },
  get dataLogicalLength() {
    return this.dv.getUint32(24);
  },
  get dataPhysicalLength() {
    return this.dv.getUint32(28);
  },
  get firstResourceChunk() {
    return this.dv.getUint16(32);
  },
  get resourceLogicalLength() {
    return this.dv.getUint32(34);
  },
  get resourcePhysicalLength() {
    return this.dv.getUint32(38);
  },
  get createdAt() {
    return this.dv.getMacDate(42);
  },
  get modifiedAt() {
    return this.dv.getMacDate(46);
  },
  get name() {
    return this.bytes.sublen(51, this.bytes[50]).toMacRoman();
  },
  get usedByteLength() {
    var len = 51 + this.bytes[50];
    if (len & 1) len++;
    return len;
  },
}, data.struct_props);

mac.mfs = function mfs(id, cc, sectors) {
  var mdbSectors = data.sectorize(sectors, 1024, 512);
  return Promise.resolve(cc.getBytes(mdbSectors)).then(function(bytes) {
    var mdb = new mac.MFSMasterDirectoryBlock(bytes.sublen(0, mac.MFSMasterDirectoryBlock.byteLength));
    if (!mdb.hasValidSignature) {
      if (bytes[84] === 0xD2 && bytes[85] === 0xD7) {
        return mac.mfs(id, cc, data.sectorize(sectors, 84, data.sectorsTotalLength(sectors) - 84));
      }
      return false;
    }
    postMessage({
      id: id,
      headline: 'callback',
      callback: 'onentry',
      args: [{
        path: [mdb.name],
        metadata: {
          isFolder: true,
        },
      }],
    });
    var chunkSize = mdb.allocChunkSize;
    var allocOffset = mdb.firstAllocBlock * 512 - 2*mdb.allocChunkSize;
    var mapSectors = data.sectorize(sectors,
      512 * 2 + mdb.byteLength,
      Math.ceil((mdb.allocChunkCount * 12) / 8));
    return Promise.resolve(cc.getBytes(mapSectors)).then(function(bytes) {
      var dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
      var map = new Uint16Array(mdb.allocChunkCount);
      for (var i = 0; i < map.length; i++) {
        // aaaaaaaa
        // aaaabbbb
        // bbbbbbbb
        if (i & 1) {
          map[i] = dv.getUint16((i >>> 1)*3 + 1) & 0xfff;
        }
        else {
          map[i] = dv.getUint16((i >>> 1)*3) >>> 4;
        }
      }
      function getExtentSectors(allocNumber) {
        var prev = {offset:allocNumber, length:1};
        var chain = [prev];
        for (var next = map[allocNumber-2]; next > 1; next = map[next-2]) {
          if (prev.offset + prev.length === next) {
            prev.length++;
          }
          else {
            chain.push(prev = {offset:next, length:1});
          }
        }
        for (var i = 0; i < chain.length; i++) {
          chain[i].offset = allocOffset + chain[i].offset * chunkSize;
          chain[i].length *= chunkSize;
        }
        return data.sectorize(sectors, chain);
      }
      cc.cacheHint(data.sectorize(sectors, 512 * mdb.firstDirBlock, 512 * mdb.dirBlockCount));
      function nextDirBlock(block_i) {
        if (block_i >= mdb.dirBlockCount) {
          return true;
        }
        var dirBlockSectors = data.sectorize(sectors, (mdb.firstDirBlock + block_i) * 512, 512);
        return Promise.resolve(cc.getBytes(dirBlockSectors)).then(function(block) {
          var nextPos = block.byteOffset;
          var endPos = nextPos + block.byteLength;
          do {
            var fileInfo = new mac.MFSFileBlock(block.buffer, nextPos);
            if (!fileInfo.exists) break;
            var dataSectors, resourceSectors;
            if (fileInfo.dataLogicalLength === 0) {
              dataSectors = [];
            }
            else {
              dataSectors = data.sectorize(
                getExtentSectors(fileInfo.firstDataChunk),
                0, fileInfo.dataLogicalLength);
            }
            if (fileInfo.resourceLogicalLength === 0) {
              resourceSectors = [];
            }
            else {
              resourceSectors = data.sectorize(
                getExtentSectors(fileInfo.firstResourceChunk),
                0, fileInfo.resourceLogicalLength);
            }
            postMessage({
              id: id,
              headline: 'callback',
              callback: 'onentry',
              args: [{
                path: [mdb.name, fileInfo.name],
                sectors: dataSectors,
                metadata: {
                  modifiedAt: fileInfo.modifiedAt,
                  createdAt: fileInfo.createdAt,
                  type: fileInfo.type,
                  creator: fileInfo.creator,
                },
                secondary: {
                  resourceFork: {
                    sectors: resourceSectors,
                  },
                },
              }],
            });
            nextPos += fileInfo.usedByteLength;
          } while (nextPos < endPos);
          return nextDirBlock(block_i + 1);
        });
      }
      return nextDirBlock(0);
    });
  });
};

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
  get isColor() {
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

mac.hfs = function hfs(id, cc, sectors) {
  return Promise.resolve(cc.getBytes(data.sectorize(sectors, 1024, 512))).then(function(bytes) {
    var mdb = new mac.HFSMasterDirectoryBlock(bytes);
    if (!mdb.hasValidSignature) {
      if (String.fromCharCode(bytes[84], bytes[85]) === 'BD') {
        return mac.hfs(id, cc, data.sectorize(sectors, 84, data.sectorsTotalLength(sectors) - 84));
      }
      return false;
    }
    const CHUNK_LENGTH = mdb.allocationChunkByteLength;
    var allocSectors = data.sectorize(sectors, mdb.firstAllocationBlock * 512, mdb.allocationChunkCount * CHUNK_LENGTH);
    function getExtentSectors(extents) {
      return data.sectorize(allocSectors, extents.map(function(extent) {
        return {offset:extent.offset * CHUNK_LENGTH, length:extent.length * CHUNK_LENGTH};
      }));
    }
    var overflowSectors = getExtentSectors(mdb.overflowFirstExtents);
    var catalogSectors = getExtentSectors(mdb.catalogFirstExtents);
    cc.cacheHint(overflowSectors.concat(catalogSectors));
    var gotOverflow = Promise.resolve(cc.getBytes(data.sectorize(overflowSectors, 0, 512)))
    .then(function(header) {
      header = new mac.HFSNodeBlock(header);
      if (header.type !== 'header') {
        return Promise.reject('invalid overflow');
      }
      header = header.records[0];
      var result = {data:{}, resource:{}};
      function doLeaf(leaf) {
        if (leaf.type !== 'leaf') throw new Error('non-leaf node in the leaf chain');
        leaf.records.forEach(function(record) {
          var id = record.overflowFileID;
          if (id < 5) {
            throw new Error('TODO: special overflow handling');
          }
          var sectors = getExtentSectors(record.overflowExtentDataRecord.extents);
          switch (record.overflowForkType) {
            case 'data':
              result.data[id] = (result.data[id] || []).concat(sectors);
              break;
            case 'resource':
              result.resource[id] = (result.resource[id] || []).concat(sectors);
              break;
          }
        });
      }
      function nextLeaf(i) {
        if (i === 0) return result;
        var bytes = cc.getBytes(data.sectorize(overflowSectors, 512 * i, 512));
        while (bytes instanceof Uint8Array) {
          var leaf = new mac.HFSNodeBlock(bytes);
          doLeaf(leaf);
          i = leaf.nextNodeNumber;
          if (i === 0) return result;
          bytes = cc.getBytes(data.sectorize(overflowSectors, 512 * i, 512));
        }
        return bytes.then(function(leaf) {
          var leaf = new mac.HFSNodeBlock(leaf);
          doLeaf(leaf);
          return nextLeaf(leaf.nextNodeNumber);
        });
      }
      return nextLeaf(header.firstLeaf);
    });
    function onFolder(path, metadata) {
      postMessage({
        id: id,
        headline: 'callback',
        callback: 'onentry',
        args: [{
          path: path,
          metadata: {
            isFolder: true,
            id: metadata.id,
            createdAt: metadata.createdAt,
            modifiedAt: metadata.modifiedAt,
            backupAt: metadata.backupAt,
            isInvisible: metadata.isInvisible,
            iconPosition: metadata.iconPosition,
            windowRect: metadata.windowRect.toJSON(),
            isOnDesk: metadata.isOnDesk,
            isColor: metadata.isColor,
            hasCustomIcon: metadata.hasCustomIcon,
            scrollX: metadata.scrollX,
            scrollY: metadata.scrollY,
          },
        }],
      });
    }
    function onFile(path, metadata) {
      function getForkSectors(extentSectors, byteLength, overflowType) {
        var covered = data.sectorsTotalLength(extentSectors);
        if (covered >= byteLength) {
          return data.sectorize(extentSectors, 0, byteLength);
        }
        else return gotOverflow.then(function(overflow) {
          var extra = overflow[overflowType][metadata.id];
          if (!extra) return Promise.reject('insufficient extents');
          covered += data.sectorsTotalLength(extra);
          if (covered < byteLength) return Promise.reject('insufficient extents');
          return data.sectorize(extentSectors.concat(extra), 0, byteLength);
        });
      }
      function onSectors(dataSectors, resourceSectors) {
        postMessage({
          id: id,
          headline: 'callback',
          callback: 'onentry',
          args: [{
            path: path,
            sectors: dataSectors,
            metadata: {
              type: metadata.type,
              creator: metadata.creator,
              isOnDesk: metadata.isOnDesk,
              isColor: metadata.isColor,
              hasCustomIcon: metadata.hasCustomIcon,
              isInvisible: metadata.isInvisible,
              isAlias: metadata.isAlias,
              id: metadata.id,
              iconPosition: metadata.iconPosition,
              createdAt: metadata.createdAt,
              modifiedAt: metadata.modifiedAt,
              backupAt: metadata.backupAt,
              putAwayFolderID: metadata.putAwayFolderID,
            },
            secondary: {
              resourceFork: {
                sectors: resourceSectors,
              },
            },
          }],
        });
      }
      var dataSectors = getForkSectors(
        getExtentSectors(metadata.dataForkFirstExtentRecord),
        metadata.dataForkInfo.logicalEOF,
        'data');
      var resourceSectors = getForkSectors(
        getExtentSectors(metadata.resourceForkFirstExtentRecord),
        metadata.resourceForkInfo.logicalEOF,
        'resource');
      if (typeof dataSectors.then === 'function' || typeof resourceSectors.then === 'function') {
        return Promise.all([dataSectors, resourceSectors])
        .then(function(values) {
          onSectors(values[0], values[1]);
        });
      }
      onSectors(dataSectors, resourceSectors);
    }
    var gotCatalog = Promise.resolve(cc.getBytes(data.sectorize(catalogSectors, 0, 512)))
    .then(function(header) {
      header = new mac.HFSNodeBlock(header);
      if (header.type !== 'header') {
        return Promise.reject('invalid catalog');
      }
      header = header.records[0];
      var parentPaths = {0:'', 1:'', 2:'_EXTENTS:', 3:'_CATALOG:', 4:'_BADALLOC:'};
      var pending = Promise.resolve(null);
      var early;
      function doRecord(record) {
        if (!(record.parentFolderID in parentPaths)) {
          if (!early) early = {};
          if (!(record.parentFolderID in early)) {
            early[record.parentFolderID] = [];
          }
          early[record.parentFolderID].push(record);
          return;
        }
        var parentPath = parentPaths[record.parentFolderID];
        var path = parentPath + record.name;
        var p;
        if (record.leafType === 'folder') {
          parentPaths[record.asFolder.id] = path + ':';
          p = onFolder(path.split(/:/g), record.asFolder);
          if (early && (record.asFolder.id in early)) {
            var earlyList = early[record.asFolder.id];
            delete early[record.asFolder.id];
            for (var i = 0; i < earlyList.length; i++) {
              doRecord(earlyList[i]);
            }
          }
        }
        else {
          p = onFile(path.split(/:/g), record.asFile);
        }
        if (p && typeof p.then === 'function') {
          pending = Promise.all([pending, p]);
        }
      }
      function doLeaf(leaf) {
        if (leaf.type !== 'leaf') throw new Error('non-leaf node in the leaf chain');
        leaf.records.forEach(function(record) {
          if (['folder', 'file'].indexOf(record.leafType) === -1) return;
          doRecord(record);
        });
      }
      function nextLeaf(i) {
        if (i === 0) return pending;
        var bytes = cc.getBytes(data.sectorize(catalogSectors, 512 * i, 512));
        while (bytes instanceof Uint8Array) {
          var leaf = new mac.HFSNodeBlock(bytes);
          doLeaf(leaf);
          i = leaf.nextNodeNumber;
          if (i === 0) return pending;
          bytes = cc.getBytes(data.sectorize(catalogSectors, 512 * i, 512));
        }
        return bytes.then(function(leaf) {
          var leaf = new mac.HFSNodeBlock(leaf);
          doLeaf(leaf);
          return nextLeaf(leaf.nextNodeNumber);
        });
      }
      return nextLeaf(header.firstLeaf);
    });
    return gotCatalog.then(function() {
      cc.cacheHint(null);
      return true;
    });
  });
};

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

mac.resourceFork = function resourceFork(id, cc, sectors) {
  cc.cacheHint(sectors);
  var headerSectors = data.sectorize(sectors, 0, mac.ResourceHeaderBlock.byteLength);
  return Promise.resolve(cc.getBytes(headerSectors)).then(function(bytes) {
    var header = new mac.ResourceHeaderBlock(bytes.subarray(0, mac.ResourceHeaderBlock.byteLength));
    var totalLength = data.sectorsTotalLength(sectors);
    var dataEnd = header.dataOffset + header.dataLength;
    var mapEnd = header.mapOffset + header.mapLength;
    if (Math.min(header.dataOffset, header.mapOffset) < mac.ResourceHeaderBlock.byteLength
        || Math.max(dataEnd, mapEnd) > totalLength
        || !(header.dataOffset >= mapEnd || header.mapOffset >= dataEnd)) {
      return false;
    }
    var dataSectors = data.sectorize(sectors, header.dataOffset, header.dataLength);
    var mapSectors = data.sectorize(sectors, header.mapOffset, header.mapLength);
    return Promise.resolve(cc.getBytes(mapSectors)).then(function(bytes) {
      var map = new mac.ResourceMapBlock(bytes);
      var entryMetadata = [];
      var entryDataOffsets = [];
      for (var group_i = 0; group_i < map.groups.length; group_i++) {
        var group = map.groups[group_i];
        postMessage({
          id: id,
          headline: 'callback',
          callback: 'onentry',
          args: [{
            metadata: {isFolder:true},
            path: [group.name],
          }],
        });        
        for (var resource_i = 0; resource_i < group.resources.length; resource_i++) {
          var resource = group.resources[resource_i];
          entryMetadata.push({
            type: group.name,
            id: resource.id,
            name: resource.name,
          });
          entryDataOffsets.push(resource.dataOffset);
        }
      }
      var allLengthSectors = [].concat.apply([], entryDataOffsets.map(function(offset) {
        return data.sectorize(dataSectors, offset, 4);
      }));
      return Promise.resolve(cc.getBytes(allLengthSectors)).then(function(bytes) {
        var dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
        for (var entry_i = 0; entry_i < entryMetadata.length; entry_i++) {
          var metadata = entryMetadata[entry_i];
          postMessage({
            id: id,
            headline: 'callback',
            callback: 'onentry',
            args: [{
              metadata: metadata,
              path: [metadata.type, '[' + metadata.id + (metadata.name ? '] ' + metadata.name : ']')],
              sectors: data.sectorize(
                dataSectors,
                entryDataOffsets[entry_i] + 4,
                dv.getUint32(entry_i * 4)),
            }],
          });
        }
        return true;
      });
    });
  });
};

mac.XxxbleHeaderBlock = function XxxbleHeaderBlock() {
  this._init.apply(this, arguments);
};
mac.XxxbleHeaderBlock.prototype = Object.defineProperties({
  get mode() {
    switch (this.dv.getUint32(0)) {
      case 0x00051600: return 'single';
      case 0x00051607: return 'double';
      default: return 'invalid';
    }
  },
  get version() {
    return this.dv.getUint32(4);
  },
  get entryCount() {
    return this.dv.getUint16(24);
  },
}, data.struct_props);
mac.XxxbleHeaderBlock.byteLength = 26;

mac.XxxbleEntryBlock = function XxxbleEntryBlock() {
  this._init.apply(this, arguments);
};
mac.XxxbleEntryBlock.prototype = Object.defineProperties({
  get id() {
    return this.dv.getUint32(0);
  },
  get type() {
    var id = this.id;
    switch (id) {
      case 1: return 'dataFork';
      case 2: return 'resourceFork';
      case 3: return 'name';
      case 4: return 'comment';
      case 5: return 'icon1bpp';
      case 6: return 'iconColor'; // ICN#, ics#, icl4, ics4, icl8, ics8
      case 8: return 'dates';
      case 9: return 'finderInfo';
      case 10: return 'macInfo';
      case 11: return 'prodosInfo';
      case 12: return 'msdosInfo';
      case 13: return 'afpName';
      case 14: return 'afpInfo';
      case 15: return 'afpId';
      default:
        if (id & 0x80000000) {
          return 'custom' + (id & 0x7FFFFFFF);
        }
        return 'unknown' + id;
    }
  },
  get offset() {
    return this.dv.getUint32(4);
  },
  get length() {
    return this.dv.getUint32(8);
  },
}, data.struct_props);
mac.XxxbleEntryBlock.byteLength = 12;

mac.XxxbleFileBlock = function XxxbleFileBlock() {
  this._init.apply(this, arguments);
};
mac.XxxbleFileBlock.prototype = Object.defineProperties({
  get type() {
    return this.bytes.sublen(0, 4).toMacRoman();
  },
  get creator() {
    return this.bytes.sublen(4, 4).toMacRoman();
  },
  get flags() {
    return this.dv.getUint16(8);
  },
  get isOnDesk() {
    return !!(0x0001 & this.flags);
  },
  get isColor() {
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
  get iconPosition() {
    var position = {
      v: this.dv.getInt16(10),
      h: this.dv.getInt16(12),
    };
    return !(position.v && position.h) ? 'default' : position;
  },
  get folderID() {
    return this.dv.getUint16(14);
  },
  get iconID() {
    return this.dv.getUint16(16);
  },
  get scriptFlags() {
    return this.bytes[24];
  },
  get commentID() {
    return this.dv.getUint16(26);
  },
  get putAwayFolderID() {
    return this.dv.getUint32(28);
  },
}, data.struct_props);
mac.XxxbleFileBlock.byteLength = 32;

mac.singleOrDouble = function singleOrDouble(id, cc, sectors) {
  var headerSectors = data.sectorize(sectors, 0, mac.XxxbleHeaderBlock.byteLength);
  return Promise.resolve(cc.getBytes(headerSectors)).then(function(bytes) {
    var header = new mac.XxxbleHeaderBlock(bytes);
    if (header.mode === 'invalid') return false;
    var entrySectors = data.sectorize(sectors, header.byteLength, header.entryCount * mac.XxxbleEntryBlock.byteLength);
    return Promise.resolve(cc.getBytes(entrySectors)).then(function(bytes) {
      var entries = new Array(header.entryCount);
      for (var i = 0; i < entries.length; i++) {
        entries[i] = new mac.XxxbleEntryBlock(bytes.sublen(i * mac.XxxbleEntryBlock.byteLength, mac.XxxbleEntryBlock.byteLength));
      }
      var finished = Promise.resolve();
      var metadata = {};
      var secondary = {};
      for (var i = 0; i < entries.length; i++) {
        var entry = entries[i];
        secondary[entry.type] = {sectors:data.sectorize(sectors, entry.offset, entry.length)};
      }
      var dataSectors;
      if ('dataFork' in secondary) {
        dataSectors = secondary.dataFork.sectors;
        delete secondary.dataFork;
      }
      else dataSectors = [];
      if ('finderInfo' in secondary) {
        var finderInfoSectors = secondary.finderInfo.sectors;
        delete secondary.finderInfo;
        finished = Promise.all([
          finished,
          Promise.resolve(cc.getBytes(finderInfoSectors)).then(function(bytes) {
            var file = new mac.XxxbleFileBlock(bytes);
            metadata.type = file.type;
            metadata.creator = file.creator;
            metadata.isOnDesk = file.isOnDesk;
            metadata.isColor = file.isColor;
            metadata.hasCustomIcon = file.hasCustomIcon;
            metadata.isInvisible = file.isInvisible;
            metadata.isAlias = file.isAlias;
            metadata.iconPosition = file.iconPosition;
            metadata.putAwayFolderID = file.putAwayFolderID;
          }),
        ]);
      }
      return finished.then(function() {
        postMessage({
          id: id,
          headline: 'callback',
          callback: 'onentry',
          args: [{
            metadata: metadata,
            sectors: dataSectors,
            secondary: secondary,
          }],
        });
        return true;
      });
    });
  });
};

const HQX_LOOKUP = (function(b) {
  var chars = '!"#$%&\'()*+,-012345689@ABCDEFGHIJKLMNPQRSTUVXYZ[`abcdefhijklmpqr';
  for (var i = 0; i < chars.length; i++) {
    b[chars.charCodeAt(i)] = i;
  }
  return b;
})(new Uint8Array(256));

mac.decode_hqx = function decode_hqx(id, cc, sectors, outputLength) {
  return Promise.resolve(cc.getBytes(sectors)).then(function(bytes) {
    var text = bytes.toByteString();
    var start = text.match(/(^|\r|\n)\(This file must be converted with BinHex[^\r\n]*[\r\n]+:/);
    if (!start) throw new Error('invalid hqx');
    start = start.index + start[0].length;
    var end = text.indexOf(':', start);
    if (end === -1) throw new Error('unterminated hqx');
    text = text.slice(start, end).replace(/\s+/g, '');
    if (/[^!"#\$%&'\(\)\*\+,\-0-9@A-Z\[`a-r]/.test(text)) {
      throw new Error('invalid characters');
    }
    if (text.length % 4) {
      text += '!!!!'.slice(text.length % 4);
    }
    var chunks = [];
    var buf = new Uint8Array((text.length/4) * 3);
    
    var phase = 'data';
    
    var buf_i = 0;
    var copy = 0;
    function byte(b) {
      if (phase === 'rle') {
        phase = 'data';
        if (b === 0) {
          copy = buf[buf_i++] = 0x90;
          return;
        }
        if (--b === 0) return;
        buf[buf_i++] = copy;
        if (--b === 0) return;
        buf[buf_i++] = copy;
        if (--b === 0) return;
        chunks.push(buf.subarray(0, buf_i));
        buf = buf.subarray(buf_i);
        buf_i = 0;
        var rep = new Uint8Array(b);
        if (copy !== 0) for (var i = 0; i < b; i++) {
          rep[i] = copy;
        }
        chunks.push(rep);
      }
      else if (b === 0x90) {
        phase = 'rle';
      }
      else {
        copy = buf[buf_i++] = b;
      }
    }
    for (var i = 0; i < text.length; i += 4) {
      var c1 = HQX_LOOKUP[text.charCodeAt(i)];
      var c2 = HQX_LOOKUP[text.charCodeAt(i+1)];
      var c3 = HQX_LOOKUP[text.charCodeAt(i+2)];
      var c4 = HQX_LOOKUP[text.charCodeAt(i+3)];
      
      byte((c1 << 2) | (c2 >> 4));
      byte(((c2 << 4) | (c3 >> 2)) & 0xff);
      byte(((c3 << 6) | c4) & 0xff);
    }
    if (buf_i > 0) {
      chunks.push(buf.subarray(0, buf_i));
    }
    
    return new Blob(chunks);
  });
};

mac.hqx = function hqx(id, cc, sectors) {
  return Promise.resolve(cc.getBytes(sectors)).then(function(bytes) {
    var name = bytes.sublen(1, bytes[0]).toMacRoman();
    var headerStart = 1 + bytes[0] + 1;
    var type = bytes.sublen(headerStart, 4).toByteString();
    var creator = bytes.sublen(headerStart + 4, 4).toByteString();
    var dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    var flags = dv.getUint16(headerStart + 8);
    var dataLen = dv.getUint32(headerStart + 10);
    var resourceLen = dv.getUint32(headerStart + 14);
    var headerChecksum = dv.getUint16(headerStart + 18);
    var dataStart = headerStart + 20;
    var dataChecksum = dv.getUint16(dataStart + dataLen);
    var resourceStart = dataStart + dataLen + 2;
    var resourceChecksum = dv.getUint16(resourceStart + resourceLen);
    postMessage({
      id: id,
      headline: 'callback',
      callback: 'onentry',
      args: [{
        sectors: data.sectorize(sectors, dataStart, dataLen),
        path: [name],
        metadata: {
          type: type,
          creator: creator,
          isInvisible: !!(flags & 0x4000),
        },
        secondary: {
          resourceFork: {
            sectors: data.sectorize(sectors, resourceStart, resourceLen),
          },
        },
      }],
    });
    return true;
  });
};
