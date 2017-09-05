
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
sit.OriginalEntryBlock.byteLength = 122;

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

sit.v5 = function v5(id, cc, sectors) {
  return Promise.resolve(cc.getBytes(data.sectorize(sectors, 0, 80))).then(function(bytes) {
    if (!/^StuffIt \(c\)1997-\d{4} Aladdin Systems, Inc\., http:\/\/www.aladdinsys.com\/StuffIt\/\r\n/.test(bytes.toByteString())) {
      return false;
    }
    return true;
  });
};
