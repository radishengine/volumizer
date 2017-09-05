
if (!('data' in self)) importScripts('data.js');

self.sit = {};

sit.original = function original(id, cc, sectors) {
  return Promise.resolve(cc.getBytes(data.sectorize(sectors, 0, 14))).then(function(bytes) {
    if (bytes.sublen(0, 4).toByteString() !== 'SIT!' || bytes.sublen(10, 4).toByteString() !== 'rLau') {
      return false;
    }
    return true;
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
