/** 
 * Client
 * @namespace {object} Client
 * @example {
 *   backlog: [], 
 *   pending: [], 
 *   socketTimeout: 300000, 
 *   connected: 1
 * }
 */

'use strict';

/* Requires ------------------------------------------------------------------*/

const debug = require('debug')('kalm');

/* Methods -------------------------------------------------------------------*/

function Client(scope, queueList, multiplex, serializer, sessions, encrypter) {
  
  /**
   * Writes a message to a queue
   * @memberof Client
   * @param {string} name The channel to send to data through
   * @param {string|object} payload The payload to send
   * @returns {Client} The client, for chaining
   */
  function write(name, message) {
    queueList.queue(name, wrap)
      .add((scope.serial !== null) ? scope.serial.encode(message) : message);
    return scope;
  }

  /**
   * Flushes the queues and destroys the connection
   * @memberof Client
   */
  function destroy(callback) {
    if (scope.connected) {
      queueList.flush();
      setTimeout(scope.transport.disconnect.bind(null, scope, handleDisconnect), 0);
      if (callback instanceof Function) {
        scope.once('disconnect', callback);
      }
    }
  }

  /** @private */
  function wrap(event, packets) {
    let payload = serializer.serialize(event.frame, event.name, packets);
    if (scope.secretKey !== null) payload = encrypter.encrypt(payload, scope.secretKey);
    if (scope.connected === 2) scope.transport.send(scope.socket, payload);
    else scope.backlog.push(payload);
  }

  /** @private */
  function handleConnect() {
    scope.connected = 2;
    scope.backlog.forEach(scope.transport.send.bind(null, scope.socket));
    scope.backlog.length = 0;
    scope.pending.forEach(handleRequest);
    scope.pending.length = 0;
    scope.emit('connect', scope);
    scope.session = sessions.resolve(scope.id);
    debug(`log: connected to ${scope.hostname}:${scope.port}`);
  }

  /** @private */
  function handleError(err) {
    debug(`error: ${err.message}`);
  }

  /** @private */
  function handleRequest(payload) {
    const frames = serializer.deserialize((scope.secretKey !== null) ? encrypter.decrypt(payload, scope.secretKey) : payload);
    frames.forEach((frame) => {
      frame.packets.forEach((packet, messageIndex) => {
        Promise.resolve()
          .then(() => (scope.serial !== null) ? scope.serial.decode(packet) : packet)
          .catch(err => packet)
          .then(msg => {
            console.log('>>> Server received', msg);
            return msg;
          })
          .then(decodedPacket => multiplex.trigger(frame.channel, format(frame, decodedPacket, messageIndex)))
      });                 
    });
  }

  /** @private */
  function format(frame, body, messageIndex) {
    return {
      body,
      client: scope,
      reply: scope.write,
      frame: {
        id: frame.frame,
        channel: frame.channel,
        payloadBytes: frame.payloadBytes,
        payloadMessages: frame.packets.length,
        messageIndex
      },
      session: scope.session
    }
  }

  /** @private */
  function handleDisconnect() {
    scope.connected = 0;
    scope.emit('disconnect', scope);
  }

  function init() {
    if (scope.socket) handleConnect();
    else scope.socket = scope.transport.createSocket(scope);
    scope.transport.attachSocket(scope.socket, { handleDisconnect, handleRequest, handleError, handleConnect, socketTimeout: scope.socketTimeout });
    return scope;
  }

  return { write, destroy, handleRequest, backlog: [], pending: [], connected: 1, init };
}

/* Exports -------------------------------------------------------------------*/

module.exports = Client;