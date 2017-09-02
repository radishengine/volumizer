
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
      function getSectors(extents, initialOffset, byteLength) {
        var sectors = [];
        if (isNaN(initialOffset)) initialOffset = 0;
        if (isNaN(byteLength)) byteLength = Infinity;
        var i = 0;
        while (initialOffset > 0) {
          if (initialOffset < (CHUNK_LENGTH * extents[i].length)) {
            break;
          }
          initialOffset -= CHUNK_LENGTH * extents[i].length;
          i++;
        }
        for (; byteLength > 0 && i < extents.length; i++) {
          var offset = initialOffset + CHUNK_LENGTH * extents[i].offset;
          var length = Math.min(byteLength, CHUNK_LENGTH * extents[i].length - initialOffset);
          sectors.push({start:offset, end:offset+length});
          byteLength -= length;
          initialOffset = 0;
        }
        if (isFinite(byteLength)) sectors.remaining = byteLength;
        return sectors;
      }
      var alloc = cc.sublen(mdb.firstAllocationBlock * 512, mdb.allocationChunkCount * CHUNK_LENGTH);
      var overflowExtents = mdb.overflowFirstExtents;
      var gotOverflow = alloc.getBytes(getSectors(overflowExtents, 0, 512))
      .then(function(header) {
        header = new mac.HFSNodeBlock(header);
        if (header.type !== 'header') {
          return Promise.reject('invalid overflow');
        }
        header = header.records[0];
        var result = {data:{}, resource:{}};
        function nextLeaf(i) {
          if (i === 0) return result;
          return alloc.getBytes(getSectors(overflowExtents, 512 * i, 512))
          .then(function(leaf) {
            var leaf = new mac.HFSNodeBlock(leaf);
            if (leaf.type !== 'leaf') throw new Error('non-leaf node in the leaf chain');
            leaf.records.forEach(function(record) {
              if (record.overflowFileID < 5) {
                throw new Error('TODO: special overflow handling');
              }
              switch (record.overflowForkType) {
                case 'data':
                  result.data[record.overflowFileID] = getSectors(record.overflowExtentDataRecord.extents);
                  break;
                case 'resource':
                  result.resource[record.overflowFileID] = getSectors(record.overflowExtentDataRecord.extents);
                  break;
              }
            });
            return nextLeaf(leaf.nextNodeNumber);
          });
        }
        return nextLeaf(header.firstLeaf);
      });
      function onFolder(path, metadata) {
        // TODO: post back metadata (createdAt, modifiedAt, isInvisible?)
      }
      function onFile(path, metadata) {
        console.log(path);
      }
      var catalogExtents = mdb.catalogFirstExtents;
      var gotCatalog = alloc.getBytes(getSectors(catalogExtents, 0, 512))
      .then(function(header) {
        header = new mac.HFSNodeBlock(header);
        if (header.type !== 'header') {
          return Promise.reject('invalid catalog');
        }
        header = header.records[0];
        var parentPaths = {0:'', 1:'', 2:'_EXTENTS:', 3:'_CATALOG:', 4:'_BADALLOC:'};
        function nextLeaf(i) {
          if (i === 0) return result;
          return alloc.getBytes(getSectors(catalogExtents, 512 * i, 512))
          .then(function(leaf) {
            var leaf = new mac.HFSNodeBlock(leaf);
            if (leaf.type !== 'leaf') throw new Error('non-leaf node in the leaf chain');
            leaf.records.forEach(function(record) {
              if (['folder', 'file'].indexOf(record.leafType) === -1) return;
              var parentPath = parentPaths[record.parentFolderID];
              var path = parentPath + record.name;
              if (record.leafType === 'folder') {
                parentPaths[record.asFolder.id] = path + ':';
                onFolder(path.split(/:/g), record.asFolder);
              }
              else {
                onFile(path.split(/:/g), record.asFile);
              }
            });
            return nextLeaf(leaf.nextNodeNumber);
          });
        }
        return nextLeaf(header.firstLeaf);
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
