
if (!('data' in self)) importScripts('data.js');
if (!('mac' in self)) importScripts('mac.js');

self.sit = {};

sit.OriginalHeaderBlock = function OriginalHeaderBlock() {
  this._init.apply(this, arguments);
};
sit.OriginalHeaderBlock.prototype = Object.defineProperties({
  get signature1() {
    return this.bytes.sublen(0, 4).toByteString();
  },
  get totalSize() {
    return this.dv.getUint32(6);
  },
  get signature2() {
    return this.bytes.sublen(10, 4).toByteString();
  },
  get hasValidSignatures() {
    return this.signature1 === 'SIT!' && this.signature2 === 'rLau';
  },
}, data.struct_props);
sit.OriginalHeaderBlock.byteLength = 22;

sit.OriginalEntryBlock = function OriginalEntryBlock() {
  this._init.apply(this, arguments);
};
sit.OriginalEntryBlock.prototype = Object.defineProperties({
  get resourceForkMode() {
    return this.bytes[0];
  },
  get dataForkMode() {
    return this.bytes[1];    
  },
  get name() {
    return this.bytes.sublen(3, this.bytes[2]).toMacRoman();
  },
  get nameChecksum() {
    return this.dv.getUint16(34);
  },
  get childCount() {
    return this.dv.getUint16(48);
  },
  get previousEntryOffset() {
    return this.dv.getUint32(50);
  },
  get nextEntryOffset() {
    return this.dv.getUint32(54);
  },
  get parentEntryOffset() {
    return this.dv.getUint32(58);
  },
  get firstChildEntryOffset() {
    return this.dv.getInt32(62);
  },
  get type() {
    return this.bytes.sublen(66, 4).toByteString();
  },
  get creator() {
    return this.bytes.sublen(70, 4).toByteString();
  },
  get flags() {
    return this.dv.getUint16(74);
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
  get createdAt() {
    return this.dv.getMacDate(76);
  },
  get modifiedAt() {
    return this.dv.getMacDate(80);
  },
  get resourceForkRealSize() {
    return this.dv.getUint32(84);
  },
  get dataForkRealSize() {
    return this.dv.getUint32(88);
  },
  get resourceForkStoredSize() {
    return this.dv.getUint32(92);
  },
  get dataForkStoredSize() {
    return this.dv.getUint32(96);
  },
  get resourceForkChecksum() {
    return this.dv.getUint16(100);
  },
  get dataForkChecksum() {
    return this.dv.getUint16(102);
  },
  get resourceForkPaddingBytes() {
    return this.bytes[104];
  },
  get dataForkPaddingBytes() {
    return this.bytes[104];
  },
  get headerChecksum() {
    return this.dv.getUint16(110);
  },
}, data.struct_props);
sit.OriginalEntryBlock.byteLength = 112;

sit.original = function original(id, cc, sectors) {
  var headerSectors = data.sectorize(sectors, 0, sit.OriginalHeaderBlock.byteLength);
  return Promise.resolve(cc.getBytes(headerSectors)).then(function(bytes) {
    var header = new sit.OriginalHeaderBlock(bytes);
    if (!header.hasValidSignatures) return false;
    function nextFile(offset, path) {
      if (offset >= header.totalSize) return true;
      var entrySectors = data.sectorize(sectors, offset, sit.OriginalEntryBlock.byteLength);
      return Promise.resolve(cc.getBytes(entrySectors)).then(function(bytes) {
        var entry = new sit.OriginalEntryBlock(bytes);
        if (entry.dataForkMode & 0x20 || entry.resourceForkMode & 0x20) {
          if (entry.dataForkMode & 0x1 || entry.resourceForkMode & 1) {
            path = path.slice(0, -1);
          }
          else {
            path = path.concat(entry.name);
            postMessage({
              id: id,
              headline: 'callback',
              callback: 'onentry',
              args: [{
                path: path,
                metadata: {
                  isFolder:true
                },
              }],
            });
          }
          return nextFile(offset + entry.byteLength, path);
        }
        var dataOffset = offset + entry.byteLength;
        var resourceOffset = dataOffset + entry.dataForkStoredSize;
        var nextOffset = resourceOffset + entry.resourceForkStoredSize;
        var metadata = {
          isInvisible: entry.isInvisible,
        };
        postMessage({
          id: id,
          headline: 'callback',
          callback: 'onentry',
          args: [{
            path: path.concat(entry.name),
            sectors: data.sectorize(sectors, dataOffset, entry.dataForkStoredSize),
            encoding: 'sit/mode' + entry.dataForkMode,
            metadata: metadata,
            secondary: {
              resourceFork: {
                sectors: data.sectorize(sectors, resourceOffset, entry.resourceForkStoredSize),
                encoding: 'sit/mode' + entry.resourceForkMode,
              },
            },
          }],
        });
        return nextFile(nextOffset, path);
      });
    }
    return nextFile(header.byteLength, []);
  });
};

sit.V5HeaderBlock = function V5HeaderBlock() {
  this._init.apply(this, arguments);
};
sit.V5HeaderBlock.prototype = Object.defineProperties({
  get signature() {
    return this.bytes.subarray(0, 80).toByteString();
  },
  get hasValidSignature() {
    return /^StuffIt \(c\)1997-\d{4} Aladdin Systems, Inc\., http:\/\/www.aladdinsys.com\/StuffIt\/\r\n$/.test(this.signature);
  },
  get version() {
    return this.bytes[82];
  },
  get flags() {
    return this.bytes[83];
  },
  get totalSize() {
    return this.dv.getUint32(84);
  },
  get rootEntryCount() {
    return this.dv.getUint16(92);
  },
  get rootOffset() {
    return this.dv.getUint32(94);
  },
  get checksum() {
    return this.dv.getUint16(98);
  },
}, data.struct_props);
sit.V5HeaderBlock.byteLength = 100;

sit.V5EntryBlock = function V5EntryBlock() {
  this._init.apply(this, arguments);
};
sit.V5EntryBlock.prototype = Object.defineProperties({
  get signature() {
    return this.dv.getUint32(0);
  },
  get version() {
    return this.bytes[4];
  },
  get hasValidSignature() {
    return this.signature === 0xA5A5A5A5;
  },
  get part1Length() {
    return this.dv.getUint16(6);
  },
  get flags() {
    return this.bytes[9];
  },
  get isEncrypted() {
    return !!(this.flags & 0x20);
  },
  get isFolder() {
    return !!(this.flags & 0x40);
  },
  get nextEntryOffset() {
    return this.dv.getUint32(22);
  },
  get dataForkRealLength() {
    return this.dv.getUint32(34);
  },
  get firstChildOffset() {
    return this.dv.getUint32(34);
  },
  get dataForkStoredLength() {
    return this.dv.getUint32(38);
  },
  get dataForkMode() {
    return this.bytes[46];
  },
  get childCount() {
    return this.dv.getUint16(46);
  },
  get password() {
    return this.isFolder ? '' : this.bytes.sublen(48, this.bytes[47]).toByteString();
  },
  get name() {
    return this.bytes.sublen(48 + this.password.length, this.dv.getUint16(30)).toMacRoman();
  },
  get fileBlockLength() {
    return 32 + (this.version === 3 ? 0 : 4);
  },
}, data.struct_props);
sit.V5EntryBlock.minByteLength = 48;

sit.V5FileBlock = function V5FileBlock() {
  this._init.apply(this, arguments);
};
sit.V5FileBlock.prototype = Object.defineProperties({
  get hasResourceFork() {
    return !!(this.bytes[1] & 1);
  },
  get type() {
    return this.bytes.sublen(4, 4);
  },
  get creator() {
    return this.bytes.sublen(8, 4);
  },
  get finderFlags() {
    return this.dv.getUint16(12);
  },
  get isOnDesk() {
    return !!(0x0001 & this.finderFlags);
  },
  get isColor() {
    return !!(0x000E & this.finderFlags);
  },
  get requireSwitchLaunch() {
    return !!(0x0020 & this.finderFlags);
  },
  get isShared() {
    return !!(0x0040 & this.finderFlags);
  },
  get hasNoINITs() {
    return !!(0x0080 & this.finderFlags);
  },
  get hasBeenInited() {
    return !!(0x0100 & this.finderFlags);
  },
  get hasCustomIcon() {
    return !!(0x0400 & this.finderFlags);
  },
  get isStationery() {
    return !!(0x0800 & this.finderFlags);
  },
  get isNameLocked() {
    return !!(0x1000 & this.finderFlags);
  },
  get hasBundle() {
    return !!(0x2000 & this.finderFlags);
  },
  get isInvisible() {
    return !!(0x4000 & this.finderFlags);
  },
  get isAlias() {
    return !!(0x8000 & this.finderFlags);
  },
}, data.struct_props);

sit.V5ResourceForkBlock = function V5ResourceBlock() {
  this._init.apply(this, arguments);
};
sit.V5ResourceForkBlock.prototype = Object.defineProperties({
  get realLength() {
    return this.dv.getUint32(0);
  },
  get storedLength() {
    return this.dv.getUint32(4);
  },
  get checksum() {
    return this.dv.getUint16(8);
  },
  get mode() {
    return this.bytes[12];
  },
}, data.struct_props);
sit.V5ResourceForkBlock.byteLength = 13;

sit.v5 = function v5(id, cc, sectors) {
  var headerSectors = data.sectorize(sectors, 0, sit.V5HeaderBlock.byteLength);
  return Promise.resolve(cc.getBytes(headerSectors)).then(function(bytes) {
    var header = new sit.V5HeaderBlock(bytes);
    if (!header.hasValidSignature || header.version !== 5) return false;
    function nextEntry(path, offset, count) {
      if (count === 0) return true;
      var entrySectors = data.sectorize(sectors, offset, sit.V5EntryBlock.minByteLength);
      return Promise.resolve(cc.getBytes(entrySectors)).then(function(bytes) {
        var entry = new sit.V5EntryBlock(bytes);
        var fullLength = entry.part1Length;
        if (fullLength > entry.byteLength) {
          entrySectors = data.sectorize(sectors, offset, fullLength);
          return Promise.resolve(cc.getBytes(entrySectors)).then(function(bytes) {
            return new sit.V5EntryBlock(bytes);
          });
        }
        return entry;
      })
      .then(function(entry) {
        var entryPath = path.concat(entry.name);
        if (entry.isFolder) {
          postMessage({
            id: id,
            headline: 'callback',
            callback: 'onentry',
            args: [{
              path: entryPath,
              metadata: {
                isFolder: true,
              },
            }],
          });
          return nextEntry(entryPath, entry.firstChildOffset, entry.childCount)
          .then(function() {
            return nextEntry(path, entry.nextEntryOffset, count-1);
          });
        }
        var fileInfoOffset = offset + entry.byteLength;
        var fileInfoSectors = data.sectorize(sectors, fileInfoOffset, entry.fileBlockLength);
        return Promise.resolve(cc.getBytes(fileInfoSectors)).then(function(bytes) {
          var fileInfo = new sit.V5FileBlock(bytes);
          var gotResourceForkInfo;
          var dataOffset;
          if (fileInfo.hasResourceFork) {
            var resInfoOffset = fileInfoOffset + fileInfo.byteLength;
            var resInfoSectors = data.sectorize(sectors, resInfoOffset, sit.V5ResourceForkBlock.byteLength);
            gotResourceForkInfo = Promise.resolve(cc.getBytes(resInfoSectors)).then(function(bytes) {
              var resInfo = new sit.V5ResourceForkBlock(bytes);
              var resForkOffset = resInfoOffset + resInfo.byteLength;
              dataOffset = resInfoOffset + resInfo.storedLength;
              var resForkSectors = data.sectorize(sectors, resForkOffset, resInfo.storedLength);
              return {sectors:resForkSectors};
            });
          }
          else {
            dataOffset = fileInfoOffset + fileInfo.byteLength;
            gotResourceForkInfo = Promise.resolve({sectors:[]});
          }
          return gotResourceForkInfo.then(function(resForkInfo) {
            var dataForkSectors = data.sectorize(sectors, dataOffset, entry.dataForkStoredLength);
            postMessage({
              id: id,
              headline: 'callback',
              callback: 'onentry',
              args: [{
                path: entryPath,
                metadata: {
                  type: fileInfo.type,
                  creator: fileInfo.creator,
                  isInvisible: fileInfo.isInvisible,
                },
                sectors: dataForkSectors,
                secondary: {
                  resourceFork: resForkInfo,
                },
              }],
            });
            return nextEntry(path, entry.nextEntryOffset, count-1);
          });
        });
      });
    }
    return nextEntry([], header.rootOffset, header.rootEntryCount);
  });
};

function decode_mode2(id, cc, sectors, outputLength) {
  return cc.getBytes(sectors).then(function(input) {
    var output = new Uint8Array(outputLength);
    var input_i = 0, output_i = 0, copy_i = 0;
    
    var symbolSize = 9;
    var symbolMask = (1 << symbolSize) - 1;
    var bitBuf = 0, bitCount = 0;
    var bytes = new Uint8Array(256);
    var dict = new Array(256 + 1);
    for (var i = 0; i < 256; i++) {
      bytes[i] = i;
      dict[i] = bytes.subarray(i, i+1);
    }

    while (input_i < input.length) {
      while (bitCount < symbolSize) {
        bitBuf |= input[input_i++] << bitCount;
      }
      var symbol = bitBuf & symbolMask;
      bitBuf >>>= symbolSize;
      if (symbol === 256) {
        var symbolCount = dict.length - 257;
        // round up to 8 * symbol size boundary
        var skip = ((8 - symbolCount) & 7) * symbolSize;
        while (skip > bitCount) {
          skip -= bitCount;
          bitBuf = input[input_i++];
          bitCount = 8;
        }
        bitBuf >>>= skip;
        bitCount -= skip;
        // reset
        dict.splice(257, symbolCount);
        symbolSize = 9;
        symbolMask = (1 << symbolSize) - 1;
        continue;
      }
      if (symbol === symbolMask) {
        if (++symbolSize === 14) {
          throw new Error('invalid input');
        }
        symbolMask = (1 << symbolSize) - 1;
      }
      if (symbol < dict.length) {
        var part = dict[symbol];
        output.set(part, output_i);
        dict.push(output.subarray(copy_i, output_i + 1));
        copy_i = output_i;
        output_i += part.length;
      }
      else if (symbol === dict.length) {
        output[output_i++] = output[copy_i];
        dict.push(output.subarray(copy_i, output_i));
      }
      else {
        throw new Error('invalid input');
      }
    }
    
    if (output_i !== output.length) {
      throw new Error('data length mismatch');
    }
    
    return new Blob([output]);
    
  });
}
