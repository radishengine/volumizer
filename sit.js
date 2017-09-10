
if (!('data' in self)) importScripts('data.js');
if (!('mac' in self)) importScripts('mac.js');

self.sit = {};

sit.OriginalHeaderBlock = function OriginalHeaderBlock() {
  this._init.apply(this, arguments);
};
sit.OriginalHeaderBlock.prototype = Object.defineProperties({
  get signature1() {
    return this.bytes.sublen(0, 4).toByteString();
  },
  get rootEntryCount() {
    return this.dv.getUint16(4);
  },
  get totalSize() {
    return this.dv.getUint32(6);
  },
  get signature2() {
    return this.bytes.sublen(10, 4).toByteString();
  },
  get hasValidSignatures() {
    return this.signature1 === 'SIT!' && this.signature2 === 'rLau';
  },
  get rootOffset() {
    return this.dv.getUint32(16) || 22;
  },
}, data.struct_props);
sit.OriginalHeaderBlock.byteLength = 22;

sit.OriginalEntryBlock = function OriginalEntryBlock() {
  this._init.apply(this, arguments);
};
sit.OriginalEntryBlock.prototype = Object.defineProperties({
  get resourceForkMode() {
    return this.bytes[0];
  },
  get dataForkMode() {
    return this.bytes[1];    
  },
  get name() {
    return this.bytes.sublen(3, this.bytes[2]).toMacRoman();
  },
  get nameChecksum() {
    return this.dv.getUint16(34);
  },
  get childCount() {
    return this.dv.getUint16(48);
  },
  get previousEntryOffset() {
    return this.dv.getUint32(50);
  },
  get nextEntryOffset() {
    return this.dv.getUint32(54);
  },
  get parentEntryOffset() {
    return this.dv.getUint32(58);
  },
  get firstChildEntryOffset() {
    return this.dv.getInt32(62);
  },
  get type() {
    return this.bytes.sublen(66, 4).toByteString();
  },
  get creator() {
    return this.bytes.sublen(70, 4).toByteString();
  },
  get flags() {
    return this.dv.getUint16(74);
  },
  get isOnDesk() {
    return !!(0x0001 & this.flags);
  },
  get isColor() {
    return !!(0x000E & this.flags);
  },
  get requireSwitchLaunch() {
    return !!(0x0020 & this.flags);
  },
  get isShared() {
    return !!(0x0040 & this.flags);
  },
  get hasNoINITs() {
    return !!(0x0080 & this.flags);
  },
  get hasBeenInited() {
    return !!(0x0100 & this.flags);
  },
  get hasCustomIcon() {
    return !!(0x0400 & this.flags);
  },
  get isStationery() {
    return !!(0x0800 & this.flags);
  },
  get isNameLocked() {
    return !!(0x1000 & this.flags);
  },
  get hasBundle() {
    return !!(0x2000 & this.flags);
  },
  get isInvisible() {
    return !!(0x4000 & this.flags);
  },
  get isAlias() {
    return !!(0x8000 & this.flags);
  },  
  get createdAt() {
    return this.dv.getMacDate(76);
  },
  get modifiedAt() {
    return this.dv.getMacDate(80);
  },
  get resourceForkRealSize() {
    return this.dv.getUint32(84);
  },
  get dataForkRealSize() {
    return this.dv.getUint32(88);
  },
  get resourceForkStoredSize() {
    return this.dv.getUint32(92);
  },
  get dataForkStoredSize() {
    return this.dv.getUint32(96);
  },
  get resourceForkChecksum() {
    return this.dv.getUint16(100);
  },
  get dataForkChecksum() {
    return this.dv.getUint16(102);
  },
  get resourceForkPaddingBytes() {
    return this.bytes[104];
  },
  get dataForkPaddingBytes() {
    return this.bytes[105];
  },
  get headerChecksum() {
    return this.dv.getUint16(110);
  },
}, data.struct_props);
sit.OriginalEntryBlock.byteLength = 112;

sit.original = function original(id, cc, sectors) {
  var headerSectors = data.sectorize(sectors, 0, sit.OriginalHeaderBlock.byteLength);
  return Promise.resolve(cc.getBytes(headerSectors)).then(function(bytes) {
    var header = new sit.OriginalHeaderBlock(bytes);
    if (!header.hasValidSignatures) return false;
    function nextEntry(path, offset, count) {
      if (count === 0) return true;
      var entrySectors = data.sectorize(sectors, offset, sit.OriginalEntryBlock.byteLength);
      return Promise.resolve(cc.getBytes(entrySectors)).then(function(bytes) {
        var entry = new sit.OriginalEntryBlock(bytes);
        var entryPath = path.concat(entry.name);
        if (entry.firstChildEntryOffset !== -1) {
          postMessage({
            id: id,
            headline: 'callback',
            callback: 'onentry',
            args: [{
              path: entryPath,
              metadata: {
                isFolder:true
              },
            }],
          });
          return nextEntry(entryPath, entry.firstChildEntryOffset, entry.childCount)
          .then(function() {
            return nextEntry(path, entry.nextEntryOffset, count-1);
          });
        }
        var dataOffset = offset + entry.byteLength;
        var resourceOffset = dataOffset + entry.dataForkStoredSize;
        var nextOffset = resourceOffset + entry.resourceForkStoredSize;
        var metadata = {
          isInvisible: entry.isInvisible,
        };
        postMessage({
          id: id,
          headline: 'callback',
          callback: 'onentry',
          args: [{
            path: path.concat(entry.name),
            sectors: data.sectorize(sectors, dataOffset, entry.dataForkStoredSize),
            encoding: 'sit/mode' + entry.dataForkMode,
            decodedLength: entry.dataForkRealSize,
            metadata: metadata,
            secondary: {
              resourceFork: {
                sectors: data.sectorize(sectors, resourceOffset, entry.resourceForkStoredSize),
                encoding: 'sit/mode' + entry.resourceForkMode,
                decodedLength: entry.resourceForkRealSize,
              },
            },
          }],
        });
        return nextEntry(path, entry.nextEntryOffset, count-1);
      });
    }
    return nextEntry([], header.rootOffset, header.rootEntryCount);
  });
};

sit.V5HeaderBlock = function V5HeaderBlock() {
  this._init.apply(this, arguments);
};
sit.V5HeaderBlock.prototype = Object.defineProperties({
  get signature() {
    return this.bytes.subarray(0, 80).toByteString();
  },
  get hasValidSignature() {
    return /^StuffIt \(c\)1997-\d{4} Aladdin Systems, Inc\., http:\/\/www.aladdinsys.com\/StuffIt\/\r\n$/.test(this.signature);
  },
  get version() {
    return this.bytes[82];
  },
  get flags() {
    return this.bytes[83];
  },
  get totalSize() {
    return this.dv.getUint32(84);
  },
  get rootEntryCount() {
    return this.dv.getUint16(92);
  },
  get rootOffset() {
    return this.dv.getUint32(94);
  },
  get checksum() {
    return this.dv.getUint16(98);
  },
}, data.struct_props);
sit.V5HeaderBlock.byteLength = 100;

sit.V5EntryBlock = function V5EntryBlock() {
  this._init.apply(this, arguments);
};
sit.V5EntryBlock.prototype = Object.defineProperties({
  get signature() {
    return this.dv.getUint32(0);
  },
  get version() {
    return this.bytes[4];
  },
  get hasValidSignature() {
    return this.signature === 0xA5A5A5A5;
  },
  get part1Length() {
    return this.dv.getUint16(6);
  },
  get flags() {
    return this.bytes[9];
  },
  get isEncrypted() {
    return !!(this.flags & 0x20);
  },
  get isFolder() {
    return !!(this.flags & 0x40);
  },
  get nextEntryOffset() {
    return this.dv.getUint32(22);
  },
  get dataForkRealLength() {
    return this.dv.getUint32(34);
  },
  get firstChildOffset() {
    return this.dv.getUint32(34);
  },
  get dataForkStoredLength() {
    return this.dv.getUint32(38);
  },
  get dataForkMode() {
    return this.bytes[46];
  },
  get childCount() {
    return this.dv.getUint16(46);
  },
  get password() {
    return this.isFolder ? '' : this.bytes.sublen(48, this.bytes[47]).toByteString();
  },
  get name() {
    return this.bytes.sublen(48 + this.password.length, this.dv.getUint16(30)).toMacRoman();
  },
  get fileBlockLength() {
    return 32 + (this.version === 3 ? 0 : 4);
  },
}, data.struct_props);
sit.V5EntryBlock.minByteLength = 48;

sit.V5FileBlock = function V5FileBlock() {
  this._init.apply(this, arguments);
};
sit.V5FileBlock.prototype = Object.defineProperties({
  get hasResourceFork() {
    return !!(this.bytes[1] & 1);
  },
  get type() {
    return this.bytes.sublen(4, 4);
  },
  get creator() {
    return this.bytes.sublen(8, 4);
  },
  get finderFlags() {
    return this.dv.getUint16(12);
  },
  get isOnDesk() {
    return !!(0x0001 & this.finderFlags);
  },
  get isColor() {
    return !!(0x000E & this.finderFlags);
  },
  get requireSwitchLaunch() {
    return !!(0x0020 & this.finderFlags);
  },
  get isShared() {
    return !!(0x0040 & this.finderFlags);
  },
  get hasNoINITs() {
    return !!(0x0080 & this.finderFlags);
  },
  get hasBeenInited() {
    return !!(0x0100 & this.finderFlags);
  },
  get hasCustomIcon() {
    return !!(0x0400 & this.finderFlags);
  },
  get isStationery() {
    return !!(0x0800 & this.finderFlags);
  },
  get isNameLocked() {
    return !!(0x1000 & this.finderFlags);
  },
  get hasBundle() {
    return !!(0x2000 & this.finderFlags);
  },
  get isInvisible() {
    return !!(0x4000 & this.finderFlags);
  },
  get isAlias() {
    return !!(0x8000 & this.finderFlags);
  },
}, data.struct_props);

sit.V5ResourceForkBlock = function V5ResourceBlock() {
  this._init.apply(this, arguments);
};
sit.V5ResourceForkBlock.prototype = Object.defineProperties({
  get realLength() {
    return this.dv.getUint32(0);
  },
  get storedLength() {
    return this.dv.getUint32(4);
  },
  get checksum() {
    return this.dv.getUint16(8);
  },
  get mode() {
    return this.bytes[12];
  },
}, data.struct_props);
sit.V5ResourceForkBlock.byteLength = 13;

sit.v5 = function v5(id, cc, sectors) {
  var headerSectors = data.sectorize(sectors, 0, sit.V5HeaderBlock.byteLength);
  return Promise.resolve(cc.getBytes(headerSectors)).then(function(bytes) {
    var header = new sit.V5HeaderBlock(bytes);
    if (!header.hasValidSignature || header.version !== 5) return false;
    function nextEntry(path, offset, count) {
      if (count === 0) return true;
      var entrySectors = data.sectorize(sectors, offset, sit.V5EntryBlock.minByteLength);
      return Promise.resolve(cc.getBytes(entrySectors)).then(function(bytes) {
        var entry = new sit.V5EntryBlock(bytes);
        var fullLength = entry.part1Length;
        if (fullLength > entry.byteLength) {
          entrySectors = data.sectorize(sectors, offset, fullLength);
          return Promise.resolve(cc.getBytes(entrySectors)).then(function(bytes) {
            return new sit.V5EntryBlock(bytes);
          });
        }
        return entry;
      })
      .then(function(entry) {
        var entryPath = path.concat(entry.name);
        if (entry.isFolder) {
          postMessage({
            id: id,
            headline: 'callback',
            callback: 'onentry',
            args: [{
              path: entryPath,
              metadata: {
                isFolder: true,
              },
            }],
          });
          return nextEntry(entryPath, entry.firstChildOffset, entry.childCount)
          .then(function() {
            return nextEntry(path, entry.nextEntryOffset, count-1);
          });
        }
        var fileInfoOffset = offset + entry.byteLength;
        var fileInfoSectors = data.sectorize(sectors, fileInfoOffset, entry.fileBlockLength);
        return Promise.resolve(cc.getBytes(fileInfoSectors)).then(function(bytes) {
          var fileInfo = new sit.V5FileBlock(bytes);
          var gotResourceForkInfo;
          var dataOffset;
          if (fileInfo.hasResourceFork) {
            var resInfoOffset = fileInfoOffset + fileInfo.byteLength;
            var resInfoSectors = data.sectorize(sectors, resInfoOffset, sit.V5ResourceForkBlock.byteLength);
            gotResourceForkInfo = Promise.resolve(cc.getBytes(resInfoSectors)).then(function(bytes) {
              var resInfo = new sit.V5ResourceForkBlock(bytes);
              var resForkOffset = resInfoOffset + resInfo.byteLength;
              dataOffset = resInfoOffset + resInfo.storedLength;
              var resForkSectors = data.sectorize(sectors, resForkOffset, resInfo.storedLength);
              return {sectors:resForkSectors};
            });
          }
          else {
            dataOffset = fileInfoOffset + fileInfo.byteLength;
            gotResourceForkInfo = Promise.resolve({sectors:[]});
          }
          return gotResourceForkInfo.then(function(resForkInfo) {
            var dataForkSectors = data.sectorize(sectors, dataOffset, entry.dataForkStoredLength);
            postMessage({
              id: id,
              headline: 'callback',
              callback: 'onentry',
              args: [{
                path: entryPath,
                metadata: {
                  type: fileInfo.type,
                  creator: fileInfo.creator,
                  isInvisible: fileInfo.isInvisible,
                },
                sectors: dataForkSectors,
                secondary: {
                  resourceFork: resForkInfo,
                },
              }],
            });
            return nextEntry(path, entry.nextEntryOffset, count-1);
          });
        });
      });
    }
    return nextEntry([], header.rootOffset, header.rootEntryCount);
  });
};

sit.decode_mode2 = function decode_mode2(id, cc, sectors, outputLength) {
  return Promise.resolve(cc.getBytes(sectors)).then(function(input) {
    var output = new Uint8Array(outputLength);
    var input_i = 0, output_i = 0, copy_i = 0;
    
    var symbolSize = 9, symbolSize_base_i = 0;
    var symbolMask = (1 << symbolSize) - 1;
    var bitBuf = 0, bitCount = 0;
    var dict = new Array(257);
    
    while (input_i < input.length) {
      while (bitCount < symbolSize) {
        bitBuf |= input[input_i++] << bitCount;
        bitCount += 8;
      }
      var symbol = bitBuf & symbolMask;
      bitBuf >>>= symbolSize; bitCount -= symbolSize;
      if (symbol === 256) {
        // align to (symbolSize)-byte boundary
        var byteCount = input_i - symbolSize_base_i;
        var byteAlign = (symbolSize - byteCount % symbolSize) % symbolSize;
        input_i += byteAlign;
        symbolSize_base_i = input_i;
        bitBuf = bitCount = 0;
        // reset
        dict.length = 257;
        symbolSize = 9;
        symbolMask = (1 << symbolSize) - 1;
        copy_i = output_i;
        continue;
      }
      if (output_i !== copy_i) {
        if (dict.length < 16384) {
          if (dict.push(output.subarray(copy_i, output_i+1)) > symbolMask) {
            if (dict.length < 16384) {
              if (++symbolSize > 14) {
                throw new Error('invalid input');
              }
              symbolMask = (1 << symbolSize) - 1;
              symbolSize_base_i = input_i;
            }
          }
        }
      }
      if (symbol < 256) {
        output[copy_i = output_i++] = symbol;
      }
      else if (symbol < dict.length) {
        var part = dict[symbol];
        output.set(part, output_i);
        copy_i = output_i;
        output_i += part.length;
      }
      else if (symbol === dict.length) {
        output[output_i++] = output[copy_i];
      }
      else {
        throw new Error('invalid input');
      }
    }
    
    if (output_i !== output.length) {
      throw new Error('data length mismatch');
    }
    
    return new Blob([output]);
    
  });
};

sit.decode_mode3 = function decode_mode3(id, cc, sectors, outputLength) {
  return Promise.resolve(cc.getBytes(sectors)).then(function(input) {
    var output = new Uint8Array(outputLength);
    var input_i = 0, output_i = 0;
    var bitBuf = 0, bitCount = 0;
    
    function pullByte() {
      bitBuf = (bitBuf << 8) | input[input_i++];
      bitCount += 8;
    }
    
    function getBits(n) {
      if (bitCount < n) pullByte();
      var val = (bitBuf >>> (bitCount - n)) & ((1 << n) - 1);
      bitCount -= n;
      return val;
    }
    
    function getBit() {
      if (bitCount === 0) {
        bitBuf = input[input_i++];
        bitCount = 7;
        return (bitBuf >>> 7) & 1;
      }
      return (bitBuf >>> --bitCount) & 1;
    }
    
    function readBranch() {
      if (getBit()) {
        return getBits(8);
      }
      var branches = [];
      branches.push(readBranch());
      branches.push(readBranch());
      return branches;
    }
    
    var tree = readBranch();
    
    while (output_i < output.length) {
      var branch = tree;
      while (typeof branch !== 'number') {
        var leftOrRight = getBit();
        branch = branch[leftOrRight];
      }
      output[output_i++] = branch;
    }
    
    return new Blob([output]);
  });
};

sit.mode13_presets = {};
sit.mode13_presets[1] = {};
sit.mode13_presets[1].offset = [[[2,3],[4,5]],[[6,7],[8,[9,[0,[1,10]]]]]];
sit.mode13_presets[1].offset_size = 11;
sit.mode13_presets[1].len1 = [
  [[[0,[1,32]],[[97,101],[110,111]]],[[[114,116],[255,257]],[[258,320],[[256,315],[[2,9],[46,77]]]]]],
  [ [ [ [[[80,83],[84,100]],[[105,112],[[3,4],[13,49]]]],
        [ [[[65,68],[69,78]],[[99,103],[104,108]]],
          [[[109,115],[117,259]],[[[5,6],[7,8]],[[10,11],[12,14]]]]
        ]
      ],
      [ [ [[[[15,16],[17,18]],[[19,20],[21,22]]],[[[24,25],[28,30]],[[31,33],[34,35]]]],
          [[[[36,38],[39,40]],[[41,42],[43,44]]],[[[45,47],[48,50]],[[51,52],[53,54]]]]
        ],
        [ [[[[55,56],[57,58]],[[59,60],[61,62]]],[[[63,64],[66,67]],[[70,71],[72,73]]]],
          [[[[74,75],[76,79]],[[81,82],[85,86]]],[[[87,88],[90,94]],[[95,96],[98,102]]]]
        ]
      ]
    ],
    [ [ [ [[[[106,107],[118,119]],[[120,121],[122,124]]],[[[125,127],[128,136]],[[144,160],[168,169]]]],
          [[[[186,192],[224,236]],[[237,240],[248,252]]],[[[254,260],[261,262]],[[263,264],[265,269]]]]
        ],
        [ [[[[291,293],[294,295]],[[297,299],[301,303]]],[[[307,309],[312,313]],[[314,316],[317,319]]]],
          [ [[[[ 23, 26],[ 27, 29]],[[ 37, 89],[ 91, 92]]],[[[ 93,113],[123,126]],[[129,130],[131,132]]]],
            [[[[133,134],[135,137]],[[138,139],[140,141]]],[[[142,143],[145,146]],[[147,148],[149,150]]]]
          ]
        ]
      ],
      [ [ [ [[[[151,152],[153,154]],[[155,156],[157,158]]],[[[159,161],[162,163]],[[164,165],[166,167]]]],
            [[[[170,171],[172,173]],[[174,175],[176,177]]],[[[178,179],[180,181]],[[182,183],[184,185]]]]
          ],
          [ [[[[187,188],[189,190]],[[191,193],[194,195]]],[[[196,197],[198,199]],[[200,201],[202,203]]]],
            [[[[204,205],[206,207]],[[208,209],[210,211]]],[[[212,213],[214,215]],[[216,217],[218,219]]]]
          ]
        ],
        [ [ [[[[220,221],[222,223]],[[225,226],[227,228]]],[[[229,230],[231,232]],[[233,234],[235,238]]]],
            [[[[239,241],[242,243]],[[244,245],[246,247]]],[[[249,250],[251,253]],[[266,267],[268,270]]]]
          ],
          [ [[[[271,272],[273,274]],[[275,276],[277,278]]],[[[279,280],[281,282]],[[283,284],[285,286]]]],
            [[[[287,288],[289,290]],[[292,296],[298,300]]],[[[302,304],[305,306]],[[308,310],[311,318]]]]
          ]
        ]
      ]
    ]
  ]
];
sit.mode13_presets[1].len2 = [
  [ [[0,257],[[1,28],[256,[2,3]]]],
    [[[[6,10],[18,32]],[[50,72],[84,164]]],[[[258,259],[267,269]],[[[4,5],[7,8]],[[9,12],[30,42]]]]]
  ],
  [ [ [ [[[70,76],[82,163]],[[255,260],[261,262]]],
        [[[265,266],[270,271]],[[[11,13],[14,15]],[[16,20],[22,26]]]]
      ],
      [ [[[[34,38],[39,44]],[[46,48],[49,53]]],[[[54,58],[62,64]],[[65,66],[67,68]]]],
        [[[[77,78],[80,83]],[[90,97],[99,100]]],[[[101,102],[108,110]],[[111,112],[115,116]]]]
      ]
    ],
    [ [ [ [[[120,124],[128,162]],[[165,263],[264,268]]],
          [[[273,320],[[17,19],[21,23]]],[[[24,25],[29,31]],[[33,36],[40,41]]]]
        ],
        [ [[[[43,45],[47,51]],[[52,55],[56,59]]],[[[60,69],[73,74]],[[79,85],[87,88]]]],
          [[[[92,94],[96,98]],[[104,105],[109,114]]],[[[117,118],[126,129]],[[130,132],[134,140]]]]
        ]
      ],
      [ [ [ [[[146,159],[160,161]],[[168,172],[192,240]]],
            [[[272,274],[275,318]],[[[27,35],[37,57]],[[61,63],[71,81]]]]
          ],
          [ [[[[86,89],[95,103]],[[106,107],[119,122]]],[[[123,125],[127,135]],[[136,138],[142,144]]]],
            [[[[147,148],[150,152]],[[154,156],[157,158]]],[[[170,176],[180,182]],[[184,185],[186,188]]]]
          ]
        ],
        [ [ [ [[[194,198],[200,208]],[[214,216],[218,220]]],
              [[[222,224],[228,232]],[[236,237],[244,246]]]
            ],
            [ [[[248,250],[252,254]],[[276,282],[303,305]]],
              [[[[75,91],[93,113]],[[121,131],[133,137]]],[[[143,145],[149,151]],[[153,155],[166,167]]]]
            ]
          ],
          [ [ [[[[173,174],[175,178]],[[179,183],[187,189]]],[[[190,191],[196,199]],[[202,204],[206,210]]]],
              [[[[212,213],[217,225]],[[226,227],[229,230]]],[[[231,234],[238,239]],[[242,245],[249,253]]]]
            ],
            [ [ [[[277,278],[279,281]],[[283,285],[287,292]]],
                [[[295,297],[299,301]],[[[139,141],[169,171]],[[177,181],[193,195]]]]
              ],
              [ [[[[197,201],[203,205]],[[207,209],[211,215]]],[[[219,221],[223,233]],[[235,241],[243,247]]]],
                [ [[[251,280],[284,286]],[[288,289],[290,291]]],
                  [ [[293,294],[296,298]],
                    [[302,[300,304]],[[308,[306,307]],[[309,311],[[310,313],[314,[312,[[315,316],[317,319]]]]]]]]
                  ]
                ]
              ]
            ]
          ]
        ]
      ]
    ]
  ]
];
sit.mode13_presets[2] = {};
sit.mode13_presets[2].offset = [[[4,5],[6,7]],[[8,[2,3]],[[9,10],[11,[0,[1,12]]]]]];
sit.mode13_presets[2].offset_size = 13;
sit.mode13_presets[2].len1 = [
  [ [256,[0,[32,101]]],
    [[[257,[97,105]],[[108,110],[111,114]]],[[[115,116],[258,259]],[[[1,2],[4,9]],[[11,13],[46,66]]]]]
  ],
  [ [ [[[[67,68],[78,80]],[[83,84],[99,100]]],[[[102,103],[104,109]],[[112,117],[255,260]]]],
      [ [[[261,[3,5]],[[6,7],[8,10]]],[[[12,15],[16,17]],[[34,40],[44,47]]]],
        [[[[48,49],[64,65]],[[69,70],[72,73]]],[[[76,77],[79,82]],[[96,98],[107,118]]]]
      ]
    ],
    [ [ [ [[[119,120],[121,128]],[[262,263],[264,[14,18]]]],
          [[[[19,20],[21,24]],[[30,31],[33,35]]],[[[36,39],[41,42]],[[43,45],[50,51]]]]
        ],
        [ [[[[52,53],[54,56]],[[57,58],[60,61]]],[[[63,71],[74,75]],[[85,86],[87,88]]]],
          [[[[95,106],[113,122]],[[124,126],[127,129]]],[[[132,135],[136,144]],[[160,168],[169,192]]]]
        ]
      ],
      [ [ [ [[[208,240],[252,254]],[[265,266],[267,[22,23]]]],
            [[[[25,26],[27,28]],[[29,38],[55,59]]],[[[62,81],[89,90]],[[94,123],[125,130]]]]
          ],
          [ [[[[131,133],[134,137]],[[138,139],[140,141]]],[[[142,143],[145,146]],[[148,149],[150,151]]]],
            [[[[152,153],[154,156]],[[158,159],[162,163]]],[[[164,165],[166,167]],[[170,172],[174,176]]]]
          ]
        ],
        [ [ [[[[178,180],[184,186]],[[188,193],[199,200]]],[[[201,204],[206,207]],[[210,212],[216,222]]]],
            [[[[223,224],[226,227]],[[231,232],[238,242]]],[[[246,248],[250,253]],[[269,270],[271,320]]]]
          ],
          [ [ [[[[37,91],[92,93]],[[147,155],[157,161]]],[[[171,173],[175,179]],[[182,187],[189,190]]]],
              [[[[191,194],[195,196]],[[202,203],[205,209]]],[[[211,213],[214,215]],[[217,218],[220,221]]]]
            ],
            [ [[[[225,228],[229,233]],[[234,236],[237,239]]],[[[243,244],[245,247]],[[249,251],[268,274]]]],
              [ [[[277,281],[[177,181],[183,185]]],[[[197,198],[219,230]],[[235,241],[272,275]]]],
                [ [[[276,279],[280,282]],[[283,285],[318,[273,278]]]],
                  [ [[[284,287],[289,291]],[[296,306],[307,[286,288]]]],
                    [ [[[292,295],[299,301]],[[304,308],[311,312]]],
                      [ [[[290,293],[294,297]],[[298,300],[302,303]]],
                        [[[305,309],[310,315]],[[316,317],[319,[313,314]]]]
                      ]
                    ]
                  ]
                ]
              ]
            ]
          ]
        ]
      ]
    ]
  ]
];
sit.mode13_presets[2].len2 = [
  [ [[256,257],[[0,258],[[1,2],[3,4]]]],
    [ [[[32,259],[260,261]],[[[5,6],[7,8]],[[9,10],[12,14]]]],
      [[[[15,16],[28,66]],[[72,115],[255,262]]],[[[263,264],[265,269]],[[318,[11,13]],[[17,18],[19,20]]]]]
    ]
  ],
  [ [ [ [[[[22,24],[30,31]],[[34,36],[38,40]]],[[[42,44],[46,47]],[[48,49],[50,52]]]],
        [[[[54,58],[60,63]],[[64,65],[67,68]]],[[[70,74],[76,78]],[[80,82],[83,84]]]]
      ],
      [ [[[[96,97],[98,100]],[[101,102],[105,108]]],[[[110,111],[112,114]],[[116,127],[128,136]]]],
        [ [[[164,192],[240,248]],[[250,252],[254,266]]],
          [[[267,268],[270,271]],[[[21,23],[25,26]],[[27,29],[33,35]]]]
        ]
      ]
    ],
    [ [ [ [[[[37,39],[41,43]],[[45,51],[53,55]]],[[[56,61],[62,69]],[[71,73],[77,79]]]],
          [[[[81,85],[86,87]],[[88,90],[92,94]]],[[[99,103],[104,106]],[[109,117],[118,119]]]]
        ],
        [ [[[[120,122],[124,126]],[[129,130],[132,134]]],[[[138,140],[144,150]],[[152,154],[156,160]]]],
          [[[[162,163],[166,168]],[[169,170],[174,176]]],[[[178,186],[194,198]],[[200,204],[207,208]]]]
        ]
      ],
      [ [ [[[[210,212],[214,216]],[[218,222],[224,226]]],[[[228,230],[232,234]],[[236,238],[242,244]]]],
          [ [[[246,251],[253,272]],[[273,320],[[57,59],[75,89]]]],
            [[[[93,95],[107,121]],[[123,125],[131,133]]],[[[135,137],[139,142]],[[146,147],[148,153]]]]
          ]
        ],
        [ [ [[[[158,159],[161,165]],[[172,180],[182,184]]],[[[187,188],[190,191]],[[193,195],[196,201]]]],
            [[[[202,205],[206,209]],[[211,213],[215,220]]],[[[221,223],[231,239]],[[243,245],[247,249]]]]
          ],
          [ [ [[[274,275],[276,277]],[[278,279],[282,283]]],
              [[[[91,113],[141,143]],[[145,149],[151,155]]],[[[157,167],[171,173]],[[175,177],[179,181]]]]
            ],
            [ [[[[183,185],[189,197]],[[199,203],[217,219]]],[[[225,227],[229,233]],[[235,237],[241,280]]]],
              [ [[[281,285],[286,289]],[[292,299],[301,[284,287]]]],
                [ [[[288,290],[291,293]],[[294,295],[296,297]]],
                  [ [[298,300],[303,305]],
                    [[[302,304],[306,311]],[[313,[307,308]],[[309,312],[314,[310,[319,[317,[315,316]]]]]]]]
                  ]
                ]
              ]
            ]
          ]
        ]
      ]
    ]
  ]
];
sit.mode13_presets[3] = {};
sit.mode13_presets[3].offset = [[[4,5],[6,7]],[[8,[2,3]],[[9,10],[11,[12,[0,[1,13]]]]]]];
sit.mode13_presets[3].offset_size = 14;
sit.mode13_presets[3].len1 = [
  [ [[8,256],[[[0,1],[2,3]],[[4,257],[258,259]]]],
    [ [[[298,307],[309,310]],[[313,314],[316,319]]],
      [[[[64,101],[128,260]],[[286,290],[293,294]]],[[[295,296],[297,299]],[[301,302],[304,305]]]]
    ]
  ],
  [ [ [ [[[306,308],[311,312]],[[[6,7],[10,12]],[[16,20],[34,46]]]],
        [[[[48,65],[66,68]],[[72,78],[80,82]]],[[[83,84],[96,97]],[[99,102],[103,105]]]]
      ],
      [ [ [[[108,110],[111,112]],[[114,115],[116,117]]],
          [[[192,252],[254,261]],[[262,[5,9]],[[11,13],[14,15]]]]
        ],
        [ [[[[17,18],[24,28]],[[31,32],[33,36]]],[[[38,40],[42,44]],[[45,47],[49,50]]]],
          [[[[51,56],[57,58]],[[60,62],[63,67]]],[[[69,70],[71,73]],[[74,76],[77,79]]]]
        ]
      ]
    ],
    [ [ [ [[[[81,85],[86,87]],[[88,89],[95,98]]],[[[100,104],[109,118]],[[119,120],[121,127]]]],
          [[[[129,130],[136,143]],[[144,153],[160,168]]],[[[169,170],[186,191]],[[193,204],[208,223]]]]
        ],
        [ [[[[224,231],[238,239]],[[240,247],[248,250]]],[[[251,253],[255,263]],[[264,268],[315,317]]]],
          [ [[[[19,21],[22,23]],[[25,26],[27,29]]],[[[30,35],[37,39]],[[41,43],[52,53]]]],
            [[[[54,55],[59,61]],[[75,90],[91,92]]],[[[93,94],[106,107]],[[113,122],[123,124]]]]
          ]
        ]
      ],
      [ [ [ [[[[125,126],[131,132]],[[133,134],[135,137]]],[[[138,139],[140,141]],[[142,145],[146,147]]]],
            [[[[148,149],[150,151]],[[152,154],[155,156]]],[[[157,158],[159,161]],[[162,163],[164,165]]]]
          ],
          [ [[[[166,167],[171,172]],[[173,174],[175,176]]],[[[177,178],[179,180]],[[181,182],[183,184]]]],
            [[[[185,187],[188,189]],[[190,194],[195,196]]],[[[197,198],[199,200]],[[201,202],[203,205]]]]
          ]
        ],
        [ [ [[[[206,207],[209,210]],[[211,212],[213,214]]],[[[215,216],[217,218]],[[219,220],[221,222]]]],
            [[[[225,226],[227,228]],[[229,230],[232,233]]],[[[234,235],[236,237]],[[241,242],[243,244]]]]
          ],
          [ [[[[245,246],[249,265]],[[266,267],[269,270]]],[[[271,272],[273,274]],[[275,276],[277,278]]]],
            [[[[279,280],[281,282]],[[283,284],[285,287]]],[[[288,289],[291,292]],[[300,303],[318,320]]]]
          ]
        ]
      ]
    ]
  ]
];
sit.mode13_presets[3].len2 = [
  [[257,[256,[0,258]]],[[[259,261],[[1,2],[3,4]]],[[[8,32],[260,262]],[[263,[5,6]],[[7,10],[12,16]]]]]],
  [ [ [ [[[17,68],[128,136]],[[255,264],[265,269]]],
        [[[270,271],[[9,11],[14,15]]],[[[18,24],[28,31]],[[34,36],[46,48]]]]
      ],
      [ [[[[50,58],[63,64]],[[65,66],[72,74]]],[[[80,85],[96,100]],[[102,103],[108,112]]]],
        [[[[114,119],[127,170]],[[192,204],[234,238]]],[[[240,248],[252,254]],[[266,267],[268,273]]]]
      ]
    ],
    [ [ [ [[[280,318],[[13,19],[20,21]]],[[[22,25],[26,30]],[[38,39],[40,41]]]],
          [[[[42,44],[45,47]],[[49,51],[52,54]]],[[[56,57],[60,67]],[[69,70],[73,76]]]]
        ],
        [ [[[[78,81],[82,83]],[[84,86],[87,97]]],[[[98,99],[101,105]],[[110,111],[115,116]]]],
          [[[[117,118],[120,122]],[[131,134],[144,146]]],[[[153,160],[162,164]],[[168,174],[187,191]]]]
        ]
      ],
      [ [ [[[[212,221],[224,236]],[[246,250],[251,253]]],[[[272,274],[275,277]],[[279,281],[282,[23,27]]]]],
          [ [[[[29,33],[35,37]],[[43,53],[55,59]]],[[[62,71],[77,79]],[[88,89],[90,92]]]],
            [[[[94,95],[104,106]],[[109,121],[124,125]]],[[[126,130],[132,138]],[[140,142],[148,150]]]]
          ]
        ],
        [ [ [[[[152,156],[158,161]],[[163,169],[176,178]]],[[[180,182],[184,186]],[[188,190],[194,196]]]],
            [[[[198,200],[202,206]],[[208,209],[210,214]]],[[[216,220],[222,225]],[[226,228],[230,232]]]]
          ],
          [ [ [[[242,244],[247,249]],[[320,[61,75]],[[93,107],[129,133]]]],
              [[[[135,137],[143,145]],[[154,159],[165,166]]],[[[172,193],[201,207]],[[213,218],[229,231]]]]
            ],
            [ [ [[[241,243],[245,276]],[[278,283],[285,[91,113]]]],
                [[[[123,139],[141,147]],[[149,151],[155,157]]],[[[167,171],[173,175]],[[177,181],[183,185]]]]
              ],
              [ [[[[189,195],[197,199]],[[203,205],[211,215]]],[[[217,219],[223,227]],[[233,235],[237,239]]]],
                [ [[[284,286],[287,290]],[[300,303],[[179,288],[289,291]]]],
                  [ [[[293,295],[297,298]],[[299,301],[302,304]]],
                    [ [[305,308],[309,[292,294]]],
                      [[[296,306],[307,310]],[[311,312],[313,[314,[319,[316,[315,317]]]]]]]
                    ]
                  ]
                ]
              ]
            ]
          ]
        ]
      ]
    ]
  ]
];
sit.mode13_presets[4] = {};
sit.mode13_presets[4].offset = [[4,[0,5]],[[6,7],[[3,8],[9,[2,[1,10]]]]]];
sit.mode13_presets[4].offset_size = 11;
sit.mode13_presets[4].len1 = [
  [ 0,
    [[320,[256,[1,2]]],[[[32,101],[255,257]],[[258,[3,4]],[[6,8],[64,65]]]]]
  ]
  [ [ [[[[72,78],[97,105]],[[108,110],[111,114]]],[[[115,116],[128,259]],[[260,[5,7]],[[9,10],[12,16]]]]],
      [ [[[[17,24],[34,46]],[[47,48],[49,50]]],[[[66,67],[68,69]],[[73,76],[77,79]]]],
        [[[[80,82],[83,84]],[[86,96],[99,100]]],[[[102,103],[104,109]],[[112,117],[192,252]]]]
      ]
    ],
    [ [ [ [[[254,261],[262,263]],[[[11,13],[14,15]],[[18,19],[20,23]]]],
          [[[[26,28],[30,31]],[[33,35],[36,38]]],[[[39,40],[42,43]],[[44,45],[51,52]]]]
        ],
        [ [[[[53,54],[55,56]],[[57,58],[59,60]]],[[[63,70],[71,74]],[[85,87],[88,90]]]],
          [[[[94,95],[98,107]],[[118,119],[120,121]]],[[[124,127],[129,144]],[[160,168],[208,232]]]]
        ]
      ],
      [ [ [ [[[248,264],[[21,22],[25,27]]],[[[29,37],[41,61]],[[62,75],[81,89]]]],
            [[[[92,106],[113,122]],[[126,130],[131,132]]],[[[135,136],[138,139]],[[140,143],[145,146]]]]
          ],
          [ [[[[148,150],[152,153]],[[154,156],[158,159]]],[[[161,162],[164,165]],[[166,167],[169,170]]]],
            [[[[171,172],[174,176]],[[178,182],[184,186]]],[[[188,191],[193,194]],[[196,200],[202,204]]]]
          ]
        ],
        [ [ [[[[209,212],[216,220]],[[221,222],[223,224]]],[[[226,227],[230,231]],[[234,235],[238,239]]]],
            [[[[240,242],[243,244]],[[245,246],[247,250]]],[[[251,253],[265,267]],[[268,273],[311,318]]]]
          ],
          [ [ [[[[91,93],[123,125]],[[133,134],[137,141]]],[[[142,147],[149,151]],[[155,157],[163,173]]]],
              [[[[175,177],[179,180]],[[181,185],[187,189]]],[[[190,195],[197,198]],[[199,201],[203,205]]]]
            ],
            [ [[[[206,207],[210,211]],[[213,214],[215,217]]],[[[218,219],[225,228]],[[229,233],[236,237]]]],
              [ [[[241,249],[266,269]],[[270,274],[[183,271],[272,275]]]],
                [ [[[276,277],[278,284]],[[289,293],[294,313]]],
                  [ [[[279,280],[281,282]],[[283,285],[286,295]]],
                    [ [[309,310],[314,[288,290]]],
                      [ [[297,312],[[287,291],[296,299]]],
                        [[[302,305],[306,307]],[[308,[292,298]],[[304,[300,303]],[[315,316],[319,[301,317]]]]]]
                      ]
                    ]
                  ]
                ]
              ]
            ]
          ]
        ]
      ]
    ]
  ]
];
sit.mode13_presets[4].len2 = [
  [[[0,256],[[1,257],[258,259]]],[[[320,[2,3]],[[4,5],[8,12]]],[[[20,32],[260,261]],[[263,318],[[6,7],[9,10]]]]]],
  [ [ [[[[15,16],[24,50]],[[64,72],[192,255]]],[[[262,265],[269,303]],[[[13,14],[17,18]],[[19,22],[23,26]]]]],
      [ [[[[28,30],[34,36]],[[40,42],[44,46]]],[[[48,49],[56,63]],[[65,68],[78,80]]]],
        [[[[82,83],[84,90]],[[96,97],[99,100]]],[[[112,114],[115,116]],[[121,128],[186,264]]]]
      ]
    ],
    [ [ [ [[[266,270],[271,[11,21]]],[[[25,27],[29,31]],[[33,35],[38,39]]]],
          [[[[45,47],[51,52]],[[53,54],[55,58]]],[[[60,62],[66,67]],[[69,70],[71,74]]]]
        ],
        [ [[[[76,77],[79,81]],[[85,86],[88,89]]],[[[92,101],[102,103]],[[105,108],[109,110]]]],
          [[[[111,113],[119,120]],[[127,129],[132,136]]],[[[144,148],[150,156]],[[160,168],[176,182]]]]
        ]
      ],
      [ [ [ [[[185,232],[240,244]],[[248,252],[254,267]]],
            [[[268,273],[300,[37,41]]],[[[43,57],[59,61]],[[73,75],[87,94]]]]
          ],
          [ [[[[95,98],[104,106]],[[117,118],[122,124]]],[[[130,133],[138,139]],[[140,151],[152,153]]]],
            [[[[154,158],[164,169]],[[170,174],[178,180]]],[[[188,191],[200,205]],[[208,210],[212,216]]]]
          ]
        ],
        [ [ [[[[220,222],[223,224]],[[226,230],[234,236]]],[[[238,246],[247,250]],[[251,253],[272,274]]]],
            [ [[[275,277],[282,308]],[[[91,93],[107,123]],[[125,126],[131,134]]]],
              [[[[135,142],[143,145]],[[146,149],[157,159]]],[[[161,162],[163,165]],[[166,172],[173,175]]]]
            ]
          ],
          [ [ [[[[177,179],[181,183]],[[184,187],[189,190]]],[[[194,195],[196,197]],[[198,202],[204,207]]]],
              [[[[209,211],[213,214]],[[215,218],[219,221]]],[[[225,228],[231,233]],[[235,237],[241,242]]]]
            ],
            [ [[[[243,245],[249,278]],[[279,280],[281,283]]],[[[285,286],[287,288]],[[289,292],[299,305]]]],
              [ [[[307,309],[[137,141],[147,155]]],[[[167,171],[193,199]],[[201,206],[217,227]]]],
                [ [[[229,239],[276,284]],[[291,293],[295,296]]],
                  [ [[297,301],[313,[203,290]]],
                    [[[294,298],[302,304]],[[306,310],[[314,[311,312]],[[315,316],[317,319]]]]]
                  ]
                ]
              ]
            ]
          ]
        ]
      ]
    ]
  ]
];
sit.mode13_presets[5] = {};
sit.mode13_presets[5].offset = [[6,7],[[5,8],[9,[4,[[0,3],[10,[1,2]]]]]]];
sit.mode13_presets[5].offset_size = 11;
sit.mode13_presets[5].len1 = [
  [ [[[32,111],[114,116]],[[256,315],[[104,112],[117,257]]]],
    [ [[[[0,13],[34,40]],[[41,42],[44,45]]],[[[47,50],[51,56]],[[57,58],[65,67]]]],
      [[[[68,69],[70,73]],[[76,77],[78,79]]],[[[80,82],[84,97]],[[99,100],[101,105]]]]
    ]
  ],
  [ [ [ [[[107,108],[110,115]],[[118,119],[260,261]]],
        [[[262,[9,46]],[[48,49],[83,98]]],[[[102,103],[109,121]],[[258,259],[317,319]]]]
      ],
      [ [ [[[[1,2],[3,4]],[[5,6],[7,8]]],[[[10,11],[12,14]],[[15,16],[17,18]]]],
          [[[[19,20],[21,22]],[[24,26],[28,30]]],[[[31,33],[35,36]],[[37,38],[39,43]]]]
        ],
        [ [[[[52,53],[54,55]],[[59,60],[61,62]]],[[[63,64],[66,71]],[[72,74],[75,81]]]],
          [[[[85,86],[87,88]],[[89,90],[91,92]]],[[[93,94],[95,96]],[[106,113],[120,122]]]]
        ]
      ]
    ],
    [ [ [ [[[[123,124],[125,126]],[[127,128],[129,131]]],[[[135,136],[144,156]],[[160,164],[165,167]]]],
          [[[[168,169],[170,182]],[[192,196],[200,201]]],[[[202,208],[210,213]],[[216,224],[240,248]]]]
        ],
        [ [[[[250,252],[255,263]],[[264,265],[266,267]]],[[[268,269],[270,271]],[[272,273],[274,275]]]],
          [[[[276,277],[278,279]],[[280,281],[282,283]]],[[[284,285],[286,287]],[[288,312],[318,320]]]]
        ]
      ],
      [ [ [ [[[[23,25],[27,29]],[[130,132],[133,134]]],[[[137,138],[139,140]],[[141,142],[143,145]]]],
            [[[[146,147],[148,149]],[[150,151],[152,153]]],[[[154,155],[157,158]],[[159,161],[162,163]]]]
          ],
          [ [[[[166,171],[172,173]],[[174,175],[176,177]]],[[[178,179],[180,181]],[[183,184],[185,186]]]],
            [[[[187,188],[189,190]],[[191,193],[194,195]]],[[[197,198],[199,203]],[[204,205],[206,207]]]]
          ]
        ],
        [ [ [[[[209,211],[212,214]],[[215,217],[218,219]]],[[[220,221],[222,223]],[[225,226],[227,228]]]],
            [[[[229,230],[231,232]],[[233,234],[235,236]]],[[[237,238],[239,241]],[[242,243],[244,245]]]]
          ],
          [ [[[[246,247],[249,251]],[[253,254],[289,290]]],[[[291,292],[293,294]],[[295,296],[297,298]]]],
            [[[[299,300],[301,302]],[[303,304],[305,306]]],[[[307,308],[309,310]],[[311,313],[314,316]]]]
          ]
        ]
      ]
    ]
  ]
];
sit.mode13_presets[5].len2 = [
  [[[32,256],[257,[13,115]]],[[[258,259],[[9,40],[44,46]]],[[[67,83],[97,99]],[[100,101],[102,105]]]]],
  [ [ [[[108,110],[111,114]],[[116,260],[261,262]]],
      [[[[34,41],[45,47]],[[49,50],[59,65]]],[[[68,73],[77,80]],[[82,84],[98,104]]]]
    ],
    [ [ [[[109,112],[117,118]],[[119,125],[263,264]]],
        [[[265,320],[[0,42],[48,51]]],[[[52,53],[54,55]],[[56,58],[66,69]]]]
      ],
      [ [[[[70,72],[76,78]],[[79,87],[95,103]]],[[[121,266],[267,268]],[[269,[35,39]],[[43,57],[61,71]]]]],
        [ [ [[[85,86],[107,123]],[[270,271],[272,273]]],
            [[[274,318],[[1,12],[33,38]]],[[[60,62],[63,74]],[[75,81],[91,106]]]]
          ],
          [ [ [[[113,120],[275,276]],[[277,279],[[2,3],[4,6]]]],
              [[[[7,10],[36,37]],[[64,88],[89,90]]],[[[92,93],[94,96]],[[122,278],[280,281]]]]
            ],
            [ [ [[[282,283],[284,[5,8]]],[[[11,14],[15,16]],[[17,18],[19,20]]]],
                [[[[26,28],[30,128]],[[156,160],[169,182]]],[[[201,255],[285,286]],[[287,290],[292,295]]]]
              ],
              [ [ [[[301,[21,22]],[[24,25],[27,29]]],[[[124,146],[158,162]],[[165,166],[170,196]]]],
                  [[[[200,210],[211,213]],[[288,289],[291,296]]],[[[297,298],[299,302]],[[303,307],[312,314]]]]
                ],
                [ [ [[[[23,126],[129,130]],[[135,144],[147,148]]],[[[152,157],[164,167]],[[168,173],[176,179]]]],
                    [[[[185,197],[205,222]],[[224,230],[240,249]]],[[[293,294],[300,304]],[[305,306],[308,309]]]]
                  ],
                  [ [ [[[[31,131],[132,136]],[[137,138],[139,140]]],[[[141,142],[143,145]],[[150,154],[171,172]]]],
                      [[[[174,178],[180,184]],[[186,188],[192,193]]],[[[198,199],[206,208]],[[209,212],[216,226]]]]
                    ],
                    [ [ [[[228,229],[232,234]],[[236,237],[243,244]]],
                        [[[246,248],[310,311]],[[313,[127,133]],[[134,149],[159,181]]]]
                      ],
                      [ [[[[183,187],[189,202]],[[203,207],[214,220]]],[[[225,235],[238,239]],[[245,250],[251,252]]]],
                        [ [[[253,254],[[151,153],[155,161]]],[[[163,175],[177,190]],[[191,194],[195,204]]]],
                          [[[[215,217],[218,219]],[[221,223],[227,231]]],[[[233,241],[242,247]],[[315,316],[317,319]]]]
                        ]
                      ]
                    ]
                  ]
                ]
              ]
            ]
          ]
        ]
      ]
    ]
  ]
];

sit.decode_mode13 = function decode_mode13(id, cc, sectors, outputLength) {
  return Promise.resolve(cc.getBytes(sectors)).then(function(input) {
    var output = new Uint8Array(outputLength);
    var input_i = 0, output_i = 0;
    var bitBuf = 0, bitCount = 0;
    var tables;
    var mode = input[input_i++];
    var preset = mode >> 4;
    if (preset !== 0) {
      tables = sit.mode13_presets[preset];
      if (!tables) {
        throw new Error('unknown preset: ' + preset);
      }
    }
    else {
      console.warn('NYI: non-preset tables');
      return new Blob([input]);
    }
    function bit() {
      if (bitCount === 0) {
        bitBuf = input[input_i++];
        bitCount = 8;
      }
      var bit = bitBuf & 1;
      bitBuf >>>= 1;
      bitCount--;
      return bit;
    }
    function bits(n) {
      while (bitCount < n) {
        bitBuf |= input[input_i++] << bitCount;
        bitCount += 8;
      }
      var v = bitBuf & ((1 << n) - 1);
      bitBuf >>>= n;
      bitCount -= n;
      return v;
    }
    function traverse(branch) {
      do {
        branch = branch[bit()];
      } while (typeof branch !== 'number');
      return branch;
    }
    var table = tables.len1;
    while (output_i < output.length) {
      var op = traverse(table);
      if (op & 0x100) {
        table = tables.len2;
        if (op & 0x40) {
          break;
        }
        var length, offset;
        switch (op &= 0xff) {
          case 0x3F: length = 65 + bits(15); break;
          case 0x3E: length = 65 + bits(10); break;
          default: length = 3 + op; break;
        }
        op = traverse(tables.offset);
        if (op < 2) {
          offset = 2 + op;
        }
        else {
          op--;
          offset = (1 << op) + bits(op) + 1;
        }
        var copy = output.subarray(output_i - offset, output_i + length - offset);
        output.set(copy, output_i);
        output_i += length;
      }
      else {
        table = tables.len1;
        output[output_i++] = op;
      }
    }
    return new Blob([output]);
  });
};
