
if (!('data' in self)) importScripts('data.js');

self.mac = {};

mac.PartitionHeaderView = function PartitionHeaderView(buffer, byteOffset, byteLength) {
  this.bytes = new Uint8Array(buffer, byteOffset, byteLength);
  this.dv = new DataView(buffer, byteOffset, byteLength);
};
mac.PartitionHeaderView.prototype = {
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
};
mac.PartitionView.byteLength = 512;
