
var msdos = {};

DataView.prototype.getMSDOSDate = function getMSDOSDate(offset) {
  var u32 = this.getUint32(offset, true);
  return new Date(
    1980 + (u32 >>> 25),
    (u32 >>> 21) & 0xf,
    (u32 >>> 16) & 0x1f,
    (u32 >>> 11) & 0x1f,
    (u32 >>> 5) & 0x3f,
    (u32 & 0x1f) << 1);
};

return msdos;
