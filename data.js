
self.data = {};

Uint8Array.prototype.toByteString = (function INIT_TOBYTESTRING() {
  if (typeof self.TextDecoder === 'function') {
    var decoder = new TextDecoder('iso-8859-1');
    return decoder.decode.bind(decoder);
  }
  var frs = new FileReaderSync;
  return function toByteString() {
    if (this.length < 1024) {
      return String.fromCharCode.apply(null, this);
    }
    return frs.readAsText(new Blob([bytes]), 'iso-8859-1');
  };
})();

(function INIT_STREAM_METHODS() {
  var frs = new FileReaderSync;
  var manualBufferSize = 1024 * 1024;
  function streamBlobAsURL(callback, blob) {
    if (blob.size <= manualBufferSize) {
      callback(frs.readAsArrayBuffer(blob));
      return Promise.resolve();
    }
    var url = URL.createObjectURL(blob);
    return data.streamURL(callback, url).then(
      function(result) {
        URL.revokeObjectURL(url);
        return result;
      },
      function(reason) {
        URL.revokeObjectURL(url);
        return Promise.reject(reason);
      });
  }
  function streamBlobManually(callback, blob) {
    for (var offset = 0; offset < blob.size; offset += manualBufferSize) {
      callback(frs.readAsArrayBuffer(blob.slice(offset, Math.min(blob.size, offset + manualBufferSize))));
    }
    return Promise.resolve();
  }
  function fetchChunkedURL(callback, url) {
    return fetch(url).then(function(r) {
      var reader = r.body.getReader();
      function nextChunk(chunk) {
        if (chunk.done) {
          return;
        }
        chunk = chunk.value;
        callback(chunk);
        return reader.read().then(nextChunk);
      }
      return reader.read().then(nextChunk);
    });
  }
  function mozChunkedURL(callback, url) {
    var xhr = new XMLHttpRequest;
    xhr.open(url, false);
    xhr.responseType = 'moz-chunked-arraybuffer';
    xhr.onprogress = function onprogress(e) {
      callback(new Uint8Array(e.result));
    };
    xhr.send();
    return Promise.resolve();
  }
  function downloadBlobThenManuallyStream(callback, url) {
    var xhr = new XMLHttpRequest;
    xhr.open(url, false);
    xhr.responseType = 'blob';
    xhr.send();
    return streamBlobManually(xhr.result);
  }
  if (typeof self.ReadableStream === 'function' && 'getReader' in ReadableStream.prototype) {
    data.streamURL = fetchChunkedURL;
    data.streamBlob = streamBlobAsURL;
    return;
  }
  var xhr = new XMLHttpRequest;
  xhr.open('/');
  xhr.responseType = 'moz-chunked-arraybuffer';
  if (xhr.responseType === 'moz-chunked-arraybuffer') {
    data.streamURL = mozChunkedURL;
    data.streamBlob = streamBlobAsURL;
    return;
  }
  data.streamURL = downloadBlobThenManuallyStream;
  data.streamBlob = streamBlobManually;
})();
