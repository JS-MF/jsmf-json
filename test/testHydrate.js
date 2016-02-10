'use strict';

var assert = require("assert");
var should = require('should');
var JSMF = require('jsmf-core');
var json = require('../index')

describe('JSON serialization / rebuild', function() {

  describe('For metamodel', function() {

        it('works with a Simple Enum', function(done) {
            var e = new JSMF.Enum('Foo', ['on', 'off']);
            var original = new JSMF.Model('M', {}, e);
            var str = json.stringify(original);
            var rebuilt = json.parse(str);
            rebuilt.should.eql(original);
            done();
        });

        it('works with a Simple Empty Class', function(done) {
            var e = new JSMF.Class('Foo');
            var original = new JSMF.Model('M', {}, e);
            var str = json.stringify(original);
            var rebuilt = json.parse(str);
            rebuilt.should.eql(original);
            done();
        });

        it('works with a Simple Class with Attributes', function(done) {
            var e = new JSMF.Class('Foo', [], {foo: JSMF.String});
            var original = new JSMF.Model('M', {}, e);
            var str = json.stringify(original);
            var rebuilt = json.parse(str);
            rebuilt.should.eql(original);
            done();
        });

        it('works with a simple Class with Reference', function(done) {
            var e = new JSMF.Class('Foo');
            e.setReference('foo', e);
            var original = new JSMF.Model('M', {}, e);
            var str = json.stringify(original);
            var rebuilt = json.parse(str);
            rebuilt.should.eql(original);
            done();
        });

        it('works with classes', function(done) {
            var f = new JSMF.Class('Foo');
            var b = new JSMF.Class('Bar');
            b.setReference('foo', f, JSMF.Cardinality.one, 'bar', JSMF.Cardinality.some);
            var original = new JSMF.Model('M', {}, [b,f]);
            var str = json.stringify(original);
            var rebuilt = json.parse(str);
            rebuilt.should.eql(original);
            done();
        });

        it('works with Classes and Enums', function(done) {
            var f = new JSMF.Class('Foo');
            var b = new JSMF.Class('Bar');
            var e = new JSMF.Enum('Work', ['on', 'off']);
            b.setReference('foo', f, JSMF.Cardinality.one, 'bar', JSMF.Cardinality.some);
            f.setAttribute('work', e);
            var original = new JSMF.Model('M', {}, [b,f,e]);
            var str = json.stringify(original);
            var rebuilt = json.parse(str);
            rebuilt.should.eql(original);
            done();
        });

        it('works with inheritance', function(done) {
            var f = new JSMF.Class('Foo');
            var b = new JSMF.Class('Bar', f);
            var e = new JSMF.Enum('Work', ['on', 'off']);
            b.setReference('foo', f, JSMF.Cardinality.one, 'bar', JSMF.Cardinality.some);
            f.setAttribute('work', e);
            var original = new JSMF.Model('M', {}, [b,f,e]);
            var str = json.stringify(original);
            var rebuilt = json.parse(str);
            rebuilt.should.eql(original);
            done();
        });

    });

  describe('For model', function() {

      it('works for a single element without reference model', function(done) {
          var f = new Class('Foo', [], {name: String});
          var e = new f(42);
            var original = new JSMF.Model('M', {}, [e]);
            var str = json.stringify(original);
            var rebuilt = json.parse(str);
            rebuilt.should.eql(original);
            done();
      });

      it('works for a single element with a reference model', function(done) {
          var f = new Class('Foo', [], {name: String});
          var e = new f(42);
            var MM = new JSMF.Model('MM', {}, [f]);
            var original = new JSMF.Model('M', MM, [e]);
            var str = json.stringify(original);
            var rebuilt = json.parse(str);
            rebuilt.should.eql(original);
            done();
      });

  });

});
