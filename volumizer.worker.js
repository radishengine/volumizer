
importScripts(
  'data.js',
  'mac.js');

self.onmessage = function onmessage(e) {
  onmessage.promiseChain = onmessage.promiseChain.then(function() {
    var message = e.data;
    var handled;
    if (message.headline in onmessage.handlers) {
      handled = Promise.resolve(onmessage.handlers[message.headline](message));
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

var urls = {};

function getSource(source) {
  var cc;
  if (source instanceof Blob) {
    cc = new data.ChunkCache;
    cc.initBlob(source);
  }
  else if (typeof source !== 'string') {
    return Promise.reject('source must be Blob or URL string');
  }
  else if (source in urls) {
    cc = urls[source];
  }
  else {
    cc = new data.ChunkCache;
    cc.initURL(source);
    urls[source] = cc;
  }
  return cc;
}

onmessage.handlers = {
  'get-blob': function(message) {
    return getSource(message.source).getBlob(message.sectors);
  },
  'volumize': function(message) {
    var sectors = message.sectors;
    var structure = message.structure;
    var cc = getSource(message.source);
    if (typeof structure === 'string') structure = [structure];
    var promise = Promise.resolve(false);
    var errors = [];
    function tryStructure(i) {
      if (i >= structure.length) {
        if (errors.length === 0) {
          return Promise.reject('file structure not recognized');
        }
        return Promise.reject(errors.join('\n'));
      }
      var parts = structure[i].match(/^([^\/]+)\/([^\/]+)/);
      var libName = parts[1];
      var funcName = parts[2].replace(/-(.)/g, function(_, letter) {
        return letter.toUpperCase();
      });
      if (!(libName in self)) importScripts(libName + '.js');
      var lib = self[libName];
      return lib[funcName].call(lib, message.id, cc, sectors)
      .catch(function(reason) {
        errors.push(structure[i] + ': ' + reason);
        return false;
      })
      .then(function(result) {
        if (result) return true;
        return tryStructure(i + 1);
      });
    }
    return tryStructure(0);
  },
  'decode': function(message) {
    var sectors = message.sectors;
    var encoding = message.encoding;
    var decodedLength = message.decodedLength;
    var cc = getSource(message.source);
    var parts = encoding.match(/^([^\/]+)\/([^\/]+)/);
    var libName = parts[1];
    var funcName = 'decode_' + parts[2].replace(/-(.)/g, function(_, letter) {
      return letter.toUpperCase();
    });
    if (!(libName in self)) importScripts(libName + '.js');
    var lib = self[libName];
    return lib[funcName].call(lib, message.id, cc, sectors, decodedLength);
  },
};

onmessage.promiseChain = Promise.resolve();
