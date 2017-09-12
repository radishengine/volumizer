
if (!('data' in self)) importScripts('data.js');
if (!('msdos' in self)) importScripts('msdos.js');

self.z = {};

z.TrailerBlock = function TrailerBlock() {
  this._init.apply(this, arguments);
};
z.TrailerBlock = Object.defineProperties({
  get signature() {
    return this.bytes.subarray(0, 4).toByteString();
  },
  get hasValidSignature() {
    return this.signature === 'PK\x04\x05';
  },
  get partNumber() {
    return this.dv.getUint16(4, true);
  },
  get masterInfoFirstPart() {
    return this.dv.getUint16(6, true);
  },
  get localFileCount() {
    return this.dv.getUint16(8, true);
  },
  get totalFileCount() {
    return this.dv.getUint16(10, true);
  },
  get masterInfoByteLength() {
    return this.dv.getUint32(12, true);
  },
  get masterInfoLocalOffset() {
    return this.dv.getUint32(16, true);
  },
  get comment() {
    return this.bytes.sublen(22, this.dv.getUint16(20, true)).toByteString();
  },
  get isSinglePart() {
    return this.partNumber === 0;
  },
}, data.struct_props);
z.TrailerBlock.minByteLength = 22;
z.TrailerBlock.find = function(bytes) {
  var dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  for (var i = bytes.length - z.TrailerBlock.minByteLength; i >= 0; i -= 4) {
    switch (bytes[i]) {
      case 0x50: break;
      case 0x4B: i -= 1; break;
      case 0x04: i -= 2; break;
      case 0x05: i -= 3; break;
      default: continue;
    }
    if (i < 0) break;
    if (dv.getUint32(i) === 0x504B0506) {
      var commentLength = dv.getUint16(i + 20, true);
      if ((i + z.TrailerBlock.minByteLength + commentLength) <= bytes.length) {
        return new z.TrailerBlock(bytes.sublen(i, 22 + commentLength));
      }
    }
  }
  return null;
};

z.systemNames = [
  'msdos', 'amiga', 'openvms', 'unix', 'vm/cms', 'atari-st',
  'hpfs', 'mac', 'z-system', 'cp/m', 'windows', 'mvs', 'vse',
  'acorn', 'vfat', 'mvs2', 'beos', 'tandem', 'os/400', 'os/x',
];

z.encodings = {
   0: null, 1: 'z/shrunk',
   2: 'z/reduced1', 3: 'z/reduced2', 4: 'z/reduced3', 5: 'z/reduced4',
   6: 'z/imploded', 8: 'z/deflated', 9: 'z/deflated-enhanced',
  10: 'z/imploded', 12: 'z/bzip2', 14: 'z/lzma', 18: 'z/ibm-terse-old',
  19: 'z/lz77', 98: 'z/ppmd',
};

z.MasterInfoBlock = function MasterInfoBlock() {
  this._init.apply(this, arguments);
};
z.MasterInfoBlock.prototype = Object.defineProperties({
  get signature() {
    return this.bytes.subarray(0, 4).toByteString();
  },
  get hasValidSignature() {
    return this.signature === 'PK\x01\x02';
  },
  get zipSpecVersion() {
    return this.bytes[4];
  },
  get system() {
    switch z.systemNames[this.bytes[5]] || this.bytes[5];
  },
  get pkzipVersion() {
    return this.dv.getUint16(6, true);
  },
  get flags() {
    return this.dv.getUint16(8, true);
  },
  get isEncrypted() { return !!(this.flags & 1); },
  get compressionOption { return (this.flags >>> 1) & 3; },
  get hasDataDescriptor() { return !!(this.flags & (1 << 3)); },
  get hasEnhancedDeflation() { return !!(this.flags & (1 << 4)); },
  get hasCompressedPatchedData() { return !!(this.flags & (1 << 5)); },
  get hasStrongEncryption() { return !!(this.flags & (1 << 6)); },
  get hasLanguageEncoding() { return !!(this.flags & (1 << 11)); },
  get hasMaskHeaderValues() { return !!(this.flags & (1 << 13)); },
  get encoding() {
    return z.encodings[this.dv.getUint16(10, true)]; 
  },
  get modifiedAt() {
    return this.dv.getMSDOSDate(12);
  },
  get crc32() {
    return this.dv.getUint32(16, true);
  },
  get compressedSize32() {
    return this.dv.getUint32(20, true);
  },
  get uncompressedSize32() {
    return this.dv.getUint32(24, true);
  },
  get is64Bit() {
    return this.compressedSize32 === 0xffffffff;
  },
  get nameLength() {
    return this.dv.getUint16(28, true);
  },
  get extraLength() {
    return this.dv.getUint16(30, true);
  },
  get commentLength() {
    return this.dv.getUint16(32, true);
  },
  get firstContainingPart() {
    return this.dv.getUint16(34, true);
  },
  get internalAttributes() {
    return this.dv.getUint16(36, true);
  },
  get externalAttributes() {
    return this.dv.getUint32(38, true);
  },
  get prefixInfoBlockOffset() {
    return this.dv.getUint32(42, true);
  },
  get usedByteLength() {
    return 46 + this.nameLength + this.extraLength + this.commentLength;
  },
  get name() {
    return this.bytes.sublen(46, this.nameLength).toByteString; // TODO: utf-8
  },
  get extra() {
    return this.bytes.sublen(46 + this.nameLength, this.extraLength); // TODO: decode
  },
  get comment() {
    return this.bytes.sublen(46 + this.nameLength + this.extraLength, this.commentLength);
  },
}, data.struct_props);

z.zip = function zip(id, cc, sectors) {
  var totalLength = data.sectorsTotalLength(sectors);
  var suffixLength = Math.min(totalLength, 22 + 65535);
  if (suffixLength < 22) return false;
  var suffixOffset = totalLength - suffixLength;
  var suffixSectors = data.sectorize(suffixLength, suffixLength);
  return cc.getBytes(suffixSectors).then(function(suffix) {
    var trailer = z.TrailerBlock.find(suffix);
    if (!trailer) return false;
    if (!trailer.isSinglePart) {
      console.warn('NYI: multipart zips');
      return false;
    }
    var centralDirSectors = data.sectorize(sectors,
      trailer.centralDirLocalOffset,
      trailer.centralDirByteLength);
    return cc.getBytes(centralDirSectors).then(function(bytes) {
      var masterList = [];
      var offset = 0;
      while (offset < bytes.length) {
        var masterInfo = new z.MasterInfoBlock(bytes.subarray(offset));
        masterList.push(masterInfo);
        offset += masterInfo.usedByteLength;
      }
      for (var i = 0; i < masterList.length; i++) {
        console.log(masterList[i].name);
      }
    });
  });
};
