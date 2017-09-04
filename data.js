
self.data = {};

Blob.prototype.sectorize = function(sectors, options) {
  var blob = this;
  return new Blob(sectors.map(function(sector) {
    return blob.slice(sector.offset, sector.offset + sector.length);
  }), options);
};

data.sectorsTotalLength = function(sectors) {
  return sectors.reduce(function(sum, sector) {
    return sum + sector.length;
  }, 0);
};

data.sectorize = function(outSectors, inSectors) {
  if (typeof inSectors === 'number') {
    inSectors = [{offset:arguments[1], length:arguments[2]}];
  }
  if (outSectors.length === 1 && outSectors[0].offset === 0) {
    return inSectors;
  }
  if (outSectors.length === 0) {
    for (var i = 0; i < inSectors.length; i++) {
      if (inSectors[i].length !== 0) {
        throw new RangeError('not enough data');
      }
    }
    return [];
  }
  var final = [];
  var j = 0;
  for (var i = 0; i < inSectors.length; i++) {
    var offset = inSectors[i].offset;
    var length = inSectors[i].length;
    if (length === 0) continue;
    while (offset > outSectors[j].length) {
      offset -= outSectors[j++].length;
    }
    while (length > 0) {
      var partLength = Math.min(length, outSectors[j].length - offset);
      final.push({offset:outSectors[j].offset + offset, length:partLength});
      length -= partLength;
      offset = 0;
      j++;
    }
  }
  return final;
};

function download(v) {
  if (!(v instanceof Blob)) v = new Blob([v]);
  postMessage({
    headline: 'download',
    file: v,
  });
}

const frs = new FileReaderSync;

data.struct_props = {
  _init: {
    value: function(buffer, byteOffset, byteLength) {
      if (isNaN(byteOffset)) byteOffset = 0;
      if (isNaN(byteLength)) byteLength = buffer.byteLength - byteOffset;
      if (ArrayBuffer.isView(buffer)) {
        byteOffset += buffer.byteOffset;
        buffer = buffer.buffer;
      }
      this.buffer = buffer;
      this.byteOffset = byteOffset;
      this.byteLength = byteLength;
    },
  },
  bytes: {
    enumerable: true,
    configurable: true,
    get: function() {
      var bytes = new Uint8Array(this.buffer, this.byteOffset, this.byteLength);
      Object.defineProperty(this, 'bytes', {
        value: bytes,
        enumerable: true,
      });
      return bytes;
    },
  },
  dv: {
    enumerable: true,
    configurable: true,
    get: function() {
      var dv = new DataView(this.buffer, this.byteOffset, this.byteLength);
      Object.defineProperty(this, 'dv', {
        value: dv,
        enumerable: true,
      });
      return dv;
    },
  },
};

Uint8Array.prototype.subrange = Uint8Array.prototype.subarray;
Blob.prototype.subrange = Blob.prototype.slice;
String.prototype.subrange = String.prototype.substring;
Uint8Array.prototype.sublen = function(offset, length) {
  return this.subarray(offset, offset+length);
};
Blob.prototype.sublen = function(offset, length) {
  return this.slice(offset, offset+length);
};
String.prototype.sublen = String.prototype.substr;
Object.defineProperty(Blob.prototype, 'byteLength', {
  get: function() {
    return this.size;
  },
});
String.prototype.nullTerminate = function() {
  return this.replace(/\0.*/, '');
};

Uint8Array.prototype.toByteString = (function INIT_TOBYTESTRING() {
  if (typeof self.TextDecoder === 'function') {
    var decoder = new TextDecoder('iso-8859-1');
    return function toByteString() {
      return decoder.decode(this);
    };
  }
  return function toByteString() {
    if (this.length < 1024) {
      return String.fromCharCode.apply(null, this);
    }
    return frs.readAsText(new Blob([bytes]), 'iso-8859-1');
  };
})();

(function INIT_STREAM_METHODS() {
  var manualBufferSize = 1024 * 1024;
  function streamBlobAsURL(callback, blob) {
    if (blob.size <= manualBufferSize) {
      var cancelled = callback(frs.readAsArrayBuffer(blob)) === 'cancel';
      return Promise.resolve(cancelled);
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
      if (callback(frs.readAsArrayBuffer(blob.slice(offset, Math.min(blob.size, offset + manualBufferSize)))) === 'cancel') {
        return Promise.resolve(true);
      }
    }
    return Promise.resolve(false);
  }
  function fetchChunkedURL(callback, url) {
    return fetch(url).then(function(r) {
      var reader = r.body.getReader();
      function nextChunk(chunk) {
        if (chunk.done) {
          return false;
        }
        chunk = chunk.value;
        if (callback(chunk) === 'cancel') {
          reader.cancel();
          return true;
        }
        return reader.read().then(nextChunk);
      }
      return reader.read().then(nextChunk);
    });
  }
  function mozChunkedURL(callback, url) {
    return new Promise(function(resolve, reject) {
      var xhr = new XMLHttpRequest;
      xhr.open('GET', url);
      xhr.responseType = 'moz-chunked-arraybuffer';
      xhr.onprogress = function onprogress(e) {
        if (callback(new Uint8Array(xhr.response)) === 'cancel') {
          xhr.abort();
        }
      };
      xhr.onload = function oncomplete(e) {
        resolve(false);
      };
      xhr.onabort = function onabort(e) {
        resolve(true);
      };
      xhr.onerror = function onerror(e) {
        reject('download error');
      };
      xhr.send();
    });
  }
  function downloadBlobThenManuallyStream(callback, url) {
    var xhr = new XMLHttpRequest;
    xhr.open('GET', url, false);
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
  xhr.open('GET', '/');
  xhr.responseType = 'moz-chunked-arraybuffer';
  if (xhr.responseType === 'moz-chunked-arraybuffer') {
    data.streamURL = mozChunkedURL;
    data.streamBlob = streamBlobAsURL;
    return;
  }
  data.streamURL = downloadBlobThenManuallyStream;
  data.streamBlob = streamBlobManually;
})();

data.ChunkCache = function ChunkCache() {
  this.onchunk = this.onchunk.bind(this);
};
data.ChunkCache.prototype = {
  initURL: function(url) {
    this.listeners = [];
    this.complete = false;
    this.head = 0;
    var self = this;
    data.streamURL(this.onchunk, url).then(function(cancelled) {
      self.complete = true;
      self.callListeners(null, self.head);
      delete self.listeners;
    });
  },
  initBlob: function(blob) {
    this.blob = blob;
    this.head = blob.size;
    delete this.listeners;
    this.complete = true;
  },
  initSectorPattern: function(chunkCache, totalSectorLength, dataSectorLength) {
    throw new Error('TODO');
  },
  /*
  sublen: function(offset, length) {
    return new data.SubChunkCache(this, offset, offset+length);
  },
  */
  callListeners: function(chunk, head) {
    for (var i = this.listeners.length-1; i >= 0; i--) {
      if (this.listeners[i](chunk, head) === true) {
        this.listeners.splice(i, 1);
      }
    }
  },
  addListener: function(listener) {
    if (this.complete) {
      listener(null);
      return;
    }
    this.listeners.unshift(listener);
  },
  onchunk: function(chunk) {
    if (this.blob) {
      this.blob = new Blob([this.blob, chunk]);
    }
    this.callListeners(chunk, this.head);
    this.head += chunk.length;
  },
  getBlob: function(sectors) {
    if (sectors.length === 0) {
      return Promise.resolve(new Blob([]));
    }
    if (sectors.length === 1 && (sectors[0].offset + sectors[0].length) <= this.blob.size) {
      return Promise.resolve(this.blob.sublen(sectors[0].offset, sectors[0].length));
    }
    function concatBlob(blob) {
      var slices = [];
      for (var i = 0; i < sectors.length; i++) {
        slices.push(blob.sublen(sectors[i].offset, sectors[i].length));
      }
      return new Blob(slices);
    }
    var lastEnd = 0;
    for (var i = 0; i < sectors.length; i++) {
      lastEnd = Math.max(lastEnd, sectors[i].offset + sectors[i].length);
    }
    if (lastEnd <= this.blob.size) {
      return Promise.resolve(concatBlob(this.blob));
    }
    var self = this;
    return new Promise(function(resolve, reject) {
      self.addListener(function() {
        if (self.blob.size >= lastEnd) {
          resolve(concatBlob(self.blob));
          return true;
        }
        else if (self.complete) {
          reject('not enough data');
          return true;
        }
      });
    });
  },
  getBytes: function(sectors) {
    if (sectors.length === 0) return Promise.resolve(new Uint8Array(0));
    if (sectors.length === 1 && (sectors[0].offset + sectors[0].length) <= this.blob.size) {
      var blob = this.blob.sublen(sectors[0].offset, sectors[0].length);
      return Promise.resolve(new Uint8Array(frs.readAsArrayBuffer(blob)));
    }
    var blob = this.blob;
    for (var i = 0; i < sectors.length; i++) {
      if (sectors[i].offset < blob.size) {
        return this.getBlob(sectors).then(function(blob) {
          return new Uint8Array(frs.readAsArrayBuffer(blob));
        });
      }
    }
    var totalLength = 0, copy = [];
    for (var i = 0; i < sectors.length; i++) {
      var length = sectors[i].length;
      copy.push({
        bufPos: totalLength,
        blobPos: sectors[i].offset,
        length: length,
      });
      totalLength += length;
    }
    copy.sort(function(a, b) {
      return b.blobPos - a.blobPos;
    });
    var self = this;
    return new Promise(function(resolve, reject) {
      var buf, bufPos = 0;
      self.addListener(function(chunk, head) {
        if (chunk === null) {
          reject('not enough data');
          return true;
        }
        while (copy[0].blobPos < (head+chunk.length)) {
          var i = copy[0].blobPos - head;
          var j = Math.min(chunk.length, i + copy[0].length);
          chunk = chunk.subarray(i, j);
          if (!buf) {
            if (copy.length === 1 && chunk.length === copy[0].length) {
              resolve(chunk);
              return true;
            }
            buf = new Uint8Array(totalLength);
          }
          buf.set(chunk, copy[0].bufPos);
          if (copy.length === 1) {
            resolve(buf);
            return true;
          }
          copy.splice(0, 1);
        }
      });
    });
  },
};

/*
data.SubChunkCache = function SubChunkCache(cc, start, end) {
  this.cc = cc;
  this.start = start;
  this.end = end;
};
data.SubChunkCache.prototype = {
  offsetSectors: function(sectors) {
    var offset = this.start;
    return sectors.map(function(sector) {
      return {start:sector.start + offset, end:sector.end + offset};
    });
  },
  getBlob: function(sectors) {
    return this.cc.getBlob(this.offsetSectors(sectors));
  },
  getBytes: function(sectors) {
    return this.cc.getBytes(this.offsetSectors(sectors));
  },
  sublen: function(offset, length) {
    return new data.SubChunkCache(this.cc, this.start + offset, this.start + offset + length);
  },
};
*/
