/* Copyright (c) 2013-present Richard Rodger */


// mocha transport.test.js


const seneca = require('seneca');
const assert = require('assert');
const needle = require('needle');
const test = require('./seneca-transport-test.js');

const no_t = {transport: false};

process.setMaxListeners(999);


function run_client(seneca, type, port, done) {
	seneca
		.client({type, port})
		.ready(function () {
			this.act('c:1,d:A', function (err, out){
				if (err) return fin(err);

				assert.equal('{"s":"1-A"}', JSON.stringify(out));

				this.act('c:1,d:AA', function (err, out){
					if (err) return fin(err);

					assert.equal('{"s":"1-AA"}', JSON.stringify(out));
					done();
				});
			});
		});
}


describe('transport', function () {
	it('happy-tcp', function (fin) {
		test.foo_test('transport', require, fin, 'tcp');
	});

	it('happy-pin-tcp', function (fin) {
		test.foo_pintest('transport', require, fin, 'tcp');
	});

	it('happy-web', function (fin) {
		test.foo_test('transport', require, fin, 'web');
	});

	it('happy-pin-web', function (fin) {
		test.foo_pintest('transport', require, fin, 'web');
	});


	it('tcp-basic', function (fin) {
		const seneca = require('seneca')({log: 'silent', default_plugins: no_t});

		seneca
			.use('../transport.js')
			.add('c:1', function (args, done){done(null, {s: `1-${args.d}`});})
			.listen({type: 'tcp', port: 20102})
			.ready(function () {
				let count = 0;
				function check() {
					count++;
					if (count == 3) fin();
				}

				run_client(seneca, 'tcp', 20102, check);
				run_client(seneca, 'tcp', 20102, check);
				run_client(seneca, 'tcp', 20102, check);
			});
	});


	it('error-passing-http', function (fin){
		const seneca = require('seneca')({log: 'silent', default_plugins: no_t})
			.use('../transport.js');

		seneca
			.add('a:1', function (args, done){
				done(new Error('bad-wire'));
			})
			.listen(30303);

		seneca
			.client(30303)
			.act('a:1', function (err, out){
				assert.equal('seneca: Action a:1 failed: bad-wire.', err.message);
				fin();
			});
	});


	it('error-passing-tcp', function (fin){
		const seneca = require('seneca')({log: 'silent', default_plugins: no_t})
			.use('../transport.js');

		seneca
			.add('a:1', function (args, done){
				done(new Error('bad-wire'));
			})
			.listen({type: 'tcp', port: 40404});

		seneca
			.client({type: 'tcp', port: 40404})
			.act('a:1', function (err, out){
				// console.log(err)
				assert.equal('seneca: Action a:1 failed: bad-wire.', err.message);
				fin();
			});
	});


	it('own-message', function (fin){
		// a -> b -> a

		do_type('tcp', function (err){
			if (err) return fin(err);
			do_type('http', fin);
		});

		function do_type(type, fin){
			function a(args, done){counters.a++; done(null, {aa: args.a});}
			function b(args, done){counters.b++; done(null, {bb: args.b});}

			var counters = {
				log_a: 0, log_b: 0, own: 0, a: 0, b: 0, c: 0,
			};

			var a = require('seneca')({
				timeout: 111,
				default_plugins: no_t,
				log: 'silent',
			})
				.use('../transport.js', {
					check: {message_loop: false},
					warn: {own_message: true},
				})
				.add('a:1', a)
				.listen({type, port: 40405})
				.client({type, port: 40406});

			var b = require('seneca')({
				timeout: 111,
				default_plugins: no_t,
				log: 'silent',
			})
				.use('../transport.js')
				.add('b:1', b)
				.listen({type, port: 40406})
				.client({type, port: 40405});


			a.ready(function (){
				b.ready(function (){
					a.act('a:1', function (err, out){
						if (err) return fin(err); assert.equal(1, out.aa);
					});

					b.act('b:1', function (err, out){
						if (err) return fin(err); assert.equal(1, out.bb);
					});

					a.act('c:1', function (err, out){
						if (!err) assert.fail();
						assert.ok(err.timeout);
					});
				});
			});


			setTimeout(function (){
				a.close(function (err){
					if (err) return fin(err);

					b.close(function (err){
						if (err) return fin(err);

						try {
							assert.equal(1, counters.a);
							assert.equal(1, counters.b);
						} catch (e) { return fin(e); }

						fin();
					});
				});
			}, 222);
		}
	});


	it('message-loop', function (fin){
		// a -> b -> c -> a

		do_type('tcp', function (err){
			if (err) return fin(err);
			do_type('http', fin);
		});

		function do_type(type, fin){
			function a(args, done){counters.a++; done(null, {aa: args.a});}
			function b(args, done){counters.b++; done(null, {bb: args.b});}
			function c(args, done){counters.c++; done(null, {cc: args.c});}

			var counters = {
				a: 0, b: 0, c: 0, d: 0,
			};


			const aServer = require('seneca')({
				timeout: 111,
				default_plugins: no_t,
				log: 'silent',
			})
				.use('../transport.js', {
					check: {own_message: false},
					warn: {message_loop: true},
				})
				.add('a:1', a)
				.listen({type, port: 40405});

			var a = aServer
				.client({type, port: 40406});


			const bServer = require('seneca')({
				timeout: 111,
				default_plugins: no_t,
				log: 'silent',
			})
				.use('../transport.js')
				.add('b:1', b)
				.listen({type, port: 40407});

			var b = bServer
      	.client({type, port: 40408});


			const cServer = require('seneca')({
				timeout: 111,
				default_plugins: no_t,
				log: 'silent',
			})
				.use('../transport.js')
				.add('c:1', c)
				.listen({type, port: 40409});

			var c = cServer
				.client({type, port: 40410});


			a.ready(function (){
				b.ready(function (){
					c.ready(function (){
						a.act('a:1', function (err, out){
							if (err) return fin(err); assert.equal(1, out.aa);
						});

						b.act('b:1', function (err, out){
							if (err) return fin(err); assert.equal(1, out.bb);
						});

						c.act('c:1', function (err, out){
							if (err) return fin(err); assert.equal(1, out.cc);
						});

						c.act('d:1', function (err){
							if (!err) assert.fail();
							assert.ok(err.timeout);
						});
					});
				});
			});


			setTimeout(function (){
				a.close(function (err){
					if (err) return fin(err);

					b.close(function (err){
						if (err) return fin(err);

						c.close(function (err){
							if (err) return fin(err);

							try {
								assert.equal(1, counters.a);
								assert.equal(1, counters.b);
								assert.equal(1, counters.c);
							} catch (e) { return fin(e); }

							fin();
						});
					});
				});
			}, 1e3);
		}
	});
});
