/**
 *  Importer of JSON files (Metamodel+Model)
 *
©2015 Luxembourg Institute of Science and Technology All Rights Reserved
THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS" AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT OWNER OR CONTRIBUTORS BE LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.

Authors : J.S. Sottet, Nicolas Biri
*/
'use strict';

var CircularJSON = require('circular-json');
var fs = require('fs');
var JSMF = require('jsmf-core');
var _ = require('lodash');

var Class = JSMF.Class;
var Model = JSMF.Model;

function saveModel(model,path) {

    //prepare for M2 modelling elements
    var serializedResult = CircularJSON.stringify(model);
    //does not includes the attributes
    fs.writeFile(path, serializedResult, function(err) {
        if(err) {
            console.log('err');
            throw(err);
        }  else {
            console.log('Saved');
        }
    });
}

function readModel(path) {
    console.log(path);
    var raw = fs.readFileSync(path);
    console.log(raw);
    var unserializedResult = CircularJSON.parse(raw);
 return unserializedResult;
}

function stringify(m, ownTypes) {
    var result = {classes: {}, elements: {}, enums: {}, model: {}};
    result.model = prepareModel(m, ownTypes, result);
    var dryElements = _.mapValues(result.elements, function (xs) {
        return _.map(xs, function (x) { return dryElement(x, result.classes, result.elements); });
    });
    result.elements = dryElements;
    result.classes = _.mapValues(result.classes, function (xs) {
        return _.mapValues(xs, function (x) {
            return dryClass(x, ownTypes, result.enums, result.classes);
        });
    });
    result.enums = _.mapValues(result.enums, function (xs) {
        return _.mapValues(xs, function (x) { return dryEnum(x); });
    });
    return JSON.stringify(result);
}

function parse(str, ownTypes) {
    var raw = JSON.parse(str);
    var result = {}
    result.enums = _.mapValues(raw.enums, function (es) {
        return _.mapValues(es, function(v, k) {return new JSMF.Enum(k, v)})
    })
    result.classes = _.mapValues(raw.classes, function(vs) {
        return _.mapValues(vs, function(cls, name) {
            var attributes = _.mapValues(cls.attributes, function(a) {
                return reviveType(a, result.enums, ownTypes);
            });
            return new JSMF.Class(name, [], attributes);
        });
    });
    resolveClassReferences(raw.classes, result.classes);
    result.elements = _.mapValues(raw.elements, function(vs) {
        return _.map(vs, function(elem, name) {
            var cls = result.classes[elem.class.uuid][elem.class.index];
            var res = new cls(elem.attributes);
            return res;
        });
    });
    resolveElementReferences(raw.elements, result.elements);
    return hydrateModel(raw.model, result);
}

function resolveClassReferences(rawClasses, hydratedClasses) {
    for (var i in rawClasses) {
        for (var k in rawClasses[i]) {
            hydratedClasses[i][k].superClasses =
                _.map(rawClasses[i][k].superClasses, function(s) {
                    return hydratedClasses[s.uuid][s.index];
                });
            hydratedClasses[i][k].references =
                _.mapValues(rawClasses[i][k].references, function(r) {
                    var ref = { type: hydratedClasses[r.type.uuid][r.type.index]
                              , cardinality: JSMF.Cardinality.check(r.cardinality)
                              };
                    if (r.opposite !== undefined) {
                        ref.opposite = r.opposite;
                    }
                    if (r.associated !== undefined) {
                        ref.associated = hydratedClasses[r.associated.uuid][r.associated.index];
                    }
                    return ref;
                });
        }
    }
}

function resolveElementReferences(rawElements, hydratedElements) {
    for (var i in rawElements) {
        for (var k in rawElements[i]) {
            _.forEach(rawElements[i][k].references, function(refs, name) {
                hydratedElements[i][k][name] = _.map(refs, function(ref) {
                    return hydratedElements[ref.uuid][ref.index];
                })
            });
        }
    }
}

function hydrateModel(m, content) {
    var modellingElements = _.map(m.modellingElements,
        function(xs) {return _.map(xs, function(x) {var res = resolveRef(x, content); return res;});
    });
    var referenceModel = {};
    var refModel = m.referenceModel;
    if (!_.isEmpty(refModel)) {
        referenceModel = hydrateModel(refModel, content);
    }
    return new Model(m.__name, referenceModel, modellingElements)
}

function prepareModel(m, ownTypes, content) {
    var preparedModel = {};
    preparedModel.__name = m.__name;
    if (!_.isEmpty(m.referenceModel)) {
      preparedModel.referenceModel = prepareModel(m.referenceModel, ownTypes, content);
    }
    preparedModel.modellingElements = _.mapValues(
        m.modellingElements, function(xs) {
            return _.map(xs, function(x) {
                if (JSMF.isJSMFClass(x)) {
                    return prepareClass(x, content.classes);
                }
                if (JSMF.isJSMFEnum(x)) {
                    return prepareEnum(x, content.enums);
                }
                if (JSMF.isJSMFElement(x)) {
                    return prepareElement(x, content.classes, content.elements);
                }
                return x;
            });
        });
    return preparedModel;
}

function prepareEnum(m, content) {
    var enumPath = jsmfFindByName(m, content);
    if (enumPath === undefined) {
        enumPath = {uuid: JSMF.jsmfId(m), index: m.__name};
        var values = content[enumPath.uuid] || {};
        values[m.__name] =  m;
        content[enumPath.uuid] = values;
    }
    return enumPath;
}

function dryEnum(m) {
    return _.omit(m, '__name');
}

function prepareClass(m, classes) {
    var classPath = jsmfFindByName(m, classes);
    if (classPath === undefined) {
        classPath = {uuid: JSMF.jsmfId(m), index: m.__name};
        var values = classes[classPath.uuid] || {};
        values[m.__name] = m;
        classes[classPath.uuid] = values;
        _.forEach(m.references, function(r) {prepareClass(r.type, classes)});
        _.forEach(m.superClasses, function(s) {prepareClass(s, classes)});
    }
    return classPath;
}

function prepareElement(m, classes, elements) {
    var elemPath = jsmfFindByObject(m, elements);
    if (elemPath === undefined) {
        var meta = m.__jsmf__;
        elemPath = {uuid: JSMF.jsmfId(m)};
        var values = elements[elemPath.uuid] || [];
        elemPath.index = values.push(m) - 1;
        elements[elemPath.uuid] = values;
        _.forEach(meta.references, function(ref) {
            _.forEach(ref, function(e) {
                prepareElement(e, classes, elements);
            });
        });
        _.forEach(meta.associated, function(ref) {
            _.forEach(ref, function(e) {
                prepareElement(e.associated, classes, elements);
            });
        });
        prepareClass(m.conformsTo(), classes);
    }
    return elemPath;
}

function jsmfFindByName(m, content) {
    var res =  {uuid: JSMF.jsmfId(m), index: m.__name};
    if (_.has(content, [res.uuid, res.index])) {
        return res;
    }
}

function jsmfFindByObject(m, content) {
    var result = {uuid: JSMF.jsmfId(m)};
    result.index = _.indexOf(content[JSMF.jsmfId(m)], m);
    return result.index === -1 ? undefined : result;
}

function resolveRef(ref, content) {
    var uuid = ref.uuid;
    var ix = ref.index;
    var res = _.get(content.elements, [uuid, ix])
        || _.get(content.classes, [uuid, ix])
        || _.get(content.enums, [uuid, ix]);
    return res;
}

function dryClass(m, ownTypes, enums, classes) {
    var res = {};
    res.superClasses = _.map(m.superClasses, function(s) {
        return jsmfFindByName(s, classes);
    });
    res.attributes = _.mapValues(m.attributes, function(a) {
        return stringifyType(a, enums, ownTypes);
    });
    res.references = _.mapValues(m.references, function(r) {
        var dryR = { type: jsmfFindByName(r.type, classes)
               , opposite: r.opposite
               , cardinality: r.cardinality
               };
        if (r.associated !== undefined) {
            dryR.associated = jsmfFindByName(r.associated, classes);
        }
        return dryR;
    });
    return res;
}

function dryElement(m, classes, elements) {
    var meta = m.__jsmf__;
    var res = {attributes: meta.attributes};
    res.references = _.mapValues(meta.references, function(refs) {
        return _.map(refs, function(o) {
            return jsmfFindByObject(o, elements);
        });
    });
    res.associated = _.mapValues(meta.associated, function(as) {
        return _.map(as, function(a) {
            var res = jsmfFindByObject(a.associated, elements);
            return res;
        });
    });
    res.class = jsmfFindByName(m.conformsTo(), classes);
    return res;
}

function stringifyType(t, enums, ownTypes) {
    if (JSMF.isJSMFEnum(t)) {
        return prepareEnum(t, enums);
    }
    switch (t) {
        case JSMF.Number: return 'Number'
        case JSMF.Positive: return 'Positive'
        case JSMF.Negative: return 'Negative'
        case JSMF.String: return 'String'
        case JSMF.Boolean: return 'Boolean'
        case JSMF.Date: return 'Date'
        case JSMF.Array: return 'Array'
        case JSMF.Object: return 'Object'
        case JSMF.Any: return 'Any'
        default: if (t.typeName === 'Range') {
                     return 'Range(' + t.min + ', ' + t.max + ')';
                 }
                 var res = ownTypes !== undefined ? ownTypes(t) : undefined;
                 if (res !== undefined) {
                     return res;
                 } else {
                     throw new Error('Unknown type:' + t);
                 }
    }
}

function reviveType(t, enums, ownTypes) {
    var err = new Error('Unknown type:' + t);
    if (t.uuid !== undefined) {
        return enums[t.uuid][t.index];
    }
    switch (t) {
        case 'Number': return JSMF.Number
        case 'Positive': return JSMF.Positive
        case 'Negative': return JSMF.Negative
        case 'String': return JSMF.String
        case 'Boolean': return JSMF.Boolean
        case 'Date': return JSMF.Date
        case 'Array': return JSMF.Array
        case 'Object': return JSMF.Object
        case 'Any': return JSMF.Any
        default: var res = checkRange(t) || undefined;
                 if (ownTypes !== undefined) {
                     res = res || ownTypes(t);
                 }
                 if (res !== undefined) {
                    return res;
                 } else {
                   throw err;
                 }
    }
}

function checkRange(t) {
    var rangeRegex = /Range\((\d+(?:\.\d+)?), *(\d+(?:\.\d+)?)\)/;
    var res = rangeRegex.exec(t);
    if (res != null) {
        return JSMF.Range(res[1], res[2]);
    }
}

module.exports = {
    saveModel: function(model,path) {
        return saveModel(model,path);
    },
    readModel: function(path) {
        return readModel(path);
    },

    stringify: stringify,
    parse: parse
};
