
importScripts(
  'data.js',
  'mac.js');

self.onmessage = function onmessage(e) {
  onmessage.promiseChain = onmessage.promiseChain.then(function() {
    var message = e.data;
    var handled;
    if (message.headline in onmessage.handlers) {
      handled = onmessage.handlers[message.headline](message);
    }
    else {
      handled = Promise.reject('unrecognized message headline: ' + message.headline);
    }
    return handled.then(
      function(result) {
        postMessage({
          id: message.id,
          headline: 'complete',
          final: true,
          result: result,
        });
      },
      function(reason) {
        postMessage({
          id: message.id,
          headline: 'problem',
          final: true,
          problem: ''+e,
        });
      });
  });
};

var loaders = {
  'volume/mac-partitioned': function(cc) {
    return cc.getBytes([{start:1024, end:1024+512}])
    .then(function(bytes) {
      var pttn = new mac.PartitionBlock(bytes);
      if (pttn.hasValidSignature) {
        if (pttn.type === 'Apple_HFS') {
          return loaders['volume/mac-hfs'](cc.sublen(pttn.firstSector * 512, pttn.sectorCount * 512));
        }
      }
      return false;
    });
  },
  'volume/mac-hfs': function(cc) {
    return cc.getBytes([{start:1024, end:1024+512}]).then(function(bytes) {
      var mdb = new mac.HFSMasterDirectoryBlock(bytes);
      if (!mdb.hasValidSignature) {
        return false;
      }
      const CHUNK_LENGTH = mdb.allocationChunkByteLength;
      function getSectors(extents, byteLength) {
        var sectors = [];
        if (isNaN(byteLength)) byteLength = Infinity;
        for (var i = 0; byteLength > 0 && i < extents.length; i++) {
          var offset = CHUNK_LENGTH * extents[i].offset;
          var length = Math.min(byteLength, CHUNK_LENGTH * extents[i].length);
          sectors.push({start:offset, end:offset+length});
          byteLength -= length;
        }
        if (isFinite(byteLength)) sectors.remaining = byteLength;
        return sectors;
      }
      var alloc = cc.sublen(mdb.firstAllocationBlock * 512, mdb.allocationChunkCount * CHUNK_LENGTH);
      var gotOverflow = alloc.getBytes(getSectors(mdb.overflowFirstExtents, mdb.overflowByteLength))
      .then(function(bytes) {
        var header = new mac.HFSNodeBlock(bytes.subarray(0, 512));
        if (header.type !== 'header') {
          return Promise.reject('invalid overflow');
        }
        header = header.records[0];
        var node_i = header.firstLeaf;
        var result = {data:{}, resource:{}};
        while (node_i !== 0) {
          var leaf = new mac.HFSNodeBlock(bytes.sublen(node_i * 512, 512));
          leaf.records.forEach(function(record) {
            switch (record.overflowForkType) {
              case 'data':
                result.data[record.overflowFileID] = record.overflowExtentDataRecord;
                break;
              case 'resource':
                result.resource[record.overflowFileID] = record.overflowExtentDataRecord;
                break;
            }
          });
          node_i = leaf.nextNodeNumber;
        }
        return result;
      });
      return gotOverflow.then(console.log);
    });
  },
};

onmessage.handlers = {
  'open-blob': function(message) {
    var cc = new data.ChunkCache;
    cc.initBlob(message.blob);
    return loaders['volume/mac-partitioned'](cc);
  },
};

onmessage.promiseChain = Promise.resolve();
