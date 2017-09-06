
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
          }
          return nextFile(offset + entry.byteLength, path);
        }
        var dataOffset = offset + entry.byteLength;
        var resourceOffset = dataOffset + entry.dataForkStoredSize;
        var nextOffset = resourceOffset + entry.resourceForkStoredSize;
        var metadata = {};
        postMessage({
          id: id,
          headline: 'callback',
          callback: 'onentry',
          args: [{
            path: path.concat(entry.name),
            sectors: data.sectorize(sectors, dataOffset, entry.dataForkStoredSize),
            metadata: metadata,
            secondary: {
              resourceFork: {
                sectors: data.sectorize(sectors, resourceOffset, entry.resourceForkStoredSize),
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
  get hasResourceFork() {
    return !!(this.flags & 0x20);
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
    return this.bytes.subarray(48 + this.password.length, this.dv.getUint16(30)).toMacRoman();
  },
  get filePartLength() {
    if (this.isFolder) return 0;
    return 32 + (this.version === 3 ? 0 : 4) + (this.hasResourceFork ? 13 : 0);
  },
}, data.struct_props);
sit.V5EntryBlock.minByteLength = 48;

sit.V5FileBlock = function V5FileBlock() {
  this._init.apply(this, arguments);
  if (this.byteLength === 32+4+13) {
    this.resourceOffset = 32+4;
  }
};
sit.V5FileBlock.prototype = Object.defineProperties({
  get type() {
    return this.bytes.sublen(4, 4);
  },
  get creator() {
    return this.bytes.sublen(8, 4);
  },
  get finderFlags() {
    return this.dv.getUint16(12);
  },
  resourceOffset: 32,
  get resourceForkRealLength() {
    return this.dv.getUint32(this.resourceOffset);
  },
  get resourceForkStoredLength() {
    return this.dv.getUint32(this.resourceOffset + 4);
  },
  get resourceForkChecksum() {
    return this.dv.getUint16(this.resourceOffset + 8);
  },
  get resourceForkMode() {
    return this.bytes[48];
  },
}, data.struct_props);

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
          return nextEntry(path.concat(entry.name), entry.firstChildOffset, entry.childCount)
          .then(function() {
            return nextEntry(path, entry.nextEntryOffset, count-1);
          });
        }
        var fileInfoOffset = offset + entry.byteLength;
        var fileInfoSectors = data.sectorize(sectors, fileInfoOffset, entry.filePartLength);
        return Promise.resolve(cc.getBytes(fileInfoSectors)).then(function(bytes) {
          var fileInfo = new sit.V5FileBlock(bytes);
          var resourceForkOffset = fileInfoOffset + fileInfo.byteLength;
          var resourceForkSectors = data.sectorize(sectors, resourceForkOffset, fileInfo.resourceForkStoredLength);
          var dataForkOffset = resourceForkOffset + fileInfo.resourceForkStoredLength;
          var dataForkSectors = data.sectorize(sectors, dataForkOffset, entry.dataForkStoredLength);
          postMessage({
            id: id,
            headline: 'callback',
            callback: 'onentry',
            args: [{
              path: entryPath,
              metadata: {
                type: fileInfo.type,
                creator: fileInfo.creator,
              },
              sectors: dataForkSectors,
              secondary: {
                resourceFork: {
                  sectors: resourceForkSectors,
                },
              },
            }],
          });
          return nextEntry(path, entry.nextEntryOffset, count-1);
        });
      });
    }
    return nextEntry([], header.rootOffset, header.rootEntryCount);
  });
};
