
if (!('data' in self)) importScripts('data.js');
if (!('mac' in self)) importScripts('mac.js');

self.hypercard = {};

hypercard.stack = function(id, cc, sectors) {
  cc.cacheHint(sectors);
  function nextChunk(offset) {
    var chunkSectors = data.sectorize(sectors, offset, 12);
    return Promise.resolve(cc.getBytes(chunkSectors)).then(function(bytes) {
      var dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.length);
      var len = dv.getUint32(0);
      var name = bytes.sublen(4, 4).toByteString();
      var chunkId = dv.getInt32(8);
      if (offset === 0 && name !== 'STAK') return false;
      postMessage({
        id: id,
        headline: 'callback',
        callback: 'onentry',
        args: [{
          metadata: {
            type: name,
            id: chunkId,
          },
          sectors: data.sectorize(sectors, offset, len),
        }],
      });
      if (name === 'TAIL') return true;
      return nextChunk(offset + len);
    });
  }
  return nextChunk(0);
};
