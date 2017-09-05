
if (!('data' in self)) importScripts('data.js');

self.sit = {};

sit.original = function original(id, cc, sectors) {
  return cc.getBytes(data.sectorize(sectors, 0, 14)).then(function(bytes) {
    if (bytes.sublen(0, 4).toByteString() !== 'SIT!' || bytes.sublen(10, 4) !== 'rLau') {
      return false;
    }
    return true;
  });
};
