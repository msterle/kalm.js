/**
 * Kalm integration test suite
 */

'use strict';

/* Requires ------------------------------------------------------------------*/

const expect = require('chai').expect;
const Kalm = require('../../index');

/* Suite --------------------------------------------------------------------*/

describe('Integration tests', () => {

	['IPC', 'TCP', 'UDP'].forEach((transport) => {
		describe('Testing ' + transport + ' transport', () => {
			let server;

			/* --- Setup ---*/

			// Create a server before each scenario
			beforeEach(() => {
				server = Kalm.listen({ transport: Kalm.transports[transport] });
			});

			// Cleanup afterwards
			afterEach((done) => {
				server.stop(() => {
					server = null;
					done();
				});
			});

			/* --- Tests --- */

			it('should work with ' + transport, (done) => {
				let payload = {foo:'bar'};
				server.on('connection', (c) => {
					c.subscribe('test', (data) => {
						expect(data.body).to.eql(payload);
						done();
					});
				});

				let client = Kalm.connect({ transport: Kalm.transports[transport] });
				client.write('test', payload);
			});

			it('should handle large payloads with ' + transport, (done) => {
				let largePayload = [];
				while(largePayload.length < 2048) {
					largePayload.push({foo: 'bar'});
				}

				server.on('connection', (c) => {
					c.subscribe('test.large', (data) => {
						expect(data.body).to.eql(largePayload);
						done();
					});
				});

				let client = Kalm.connect({ transport: Kalm.transports[transport] });
				client.write('test.large', largePayload);
			});

      it('should not trigger for unsubscribed channels', (done) => {
        let payload = {foo:'bar'};
        server.on('connection', (c) => {
          c.subscribe('test', (data) => {
            expect(false).to.be.true; // Throw on purpose
            done();
          });

          c.unsubscribe('test');
        });

        let client = Kalm.connect({ transport: Kalm.transports[transport] });
        client.write('test', payload);

        setTimeout(() => done(), 100);
      });

      it('should not trigger until maxbyte is reached', (done) => {
        let payload = new Buffer(JSON.stringify({foo:'bar'}));
        let received = 0;
        server.on('connection', (c) => {
          c.subscribe('test', (data) => {
            expect(data.frame.payloadBytes > 20).to.be.true;
            if (received === 0) received++;
            else done();
          });
        });

        let client = Kalm.connect({ 
          transport: Kalm.transports[transport],
          serial: null,
          profile: { maxBytes: 30 } 
        });
        client.write('test', payload);
        client.write('test', payload);
      });

      it('should encrypt and decrypt and maintain integrity of messages', (done) => {
        let payload = new Buffer(JSON.stringify({foo:'bar'}));
        server.secretKey = '__some_test_key__';
        server.serial = null;
        server.on('connection', (c) => {
          c.subscribe('test', (data) => {
            expect(data.body).to.deep.equal(Array.prototype.slice.apply(payload));
            done();
          });
        });

        let client = Kalm.connect({ 
          transport: Kalm.transports[transport],
          serial: null, 
          secretKey: '__some_test_key__'
        });
        client.write('test', payload);
      });
		});
	});
});