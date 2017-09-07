
if (!('data' in self)) importScripts('data.js');
if (!('mac' in self)) importScripts('data.js');

self.hypercard = {};

hypercard.stack = function(id, cc, sectors) {
  cc.cacheHint(sectors);
  function nextChunk(offset) {
    var sectors = data.sectorize(sectors, offset, 12);
    return Promise.resolve(cc.getBytes(sectors)).then(function(bytes) {
      var dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.length);
      var len = dv.getUint32(0);
      var name = bytes.sublen(4, 4).toByteString();
      var id = dv.getInt32(8);
      if (offset === 0 && name !== 'STAK') return false;
      postMessage({
        id: id,
        headline: 'callback',
        callback: 'onentry',
        args: [{
          metadata: {
            type: name,
            id: id,
          },
          sectors: data.sectorize(sectors, offset + 12, len),
        }],
      });
      if (name === 'TAIL') return true;
      return nextChunk(offset + 12 + len);
    });
  }
  return nextChunk(0);
};
