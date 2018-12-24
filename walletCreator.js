// Copyright (c) 2018, TurtlePay Developers
//
// Please see the included LICENSE file for more information.

'use strict'

const TurtleCoinUtils = require('turtlecoin-utils')
const request = require('request-promise-native')
const RabbitMQ = require('amqplib')
const cluster = require('cluster')
const util = require('util')
const cryptoUtils = new TurtleCoinUtils()
const cpuCount = require('os').cpus().length
const topBlockUrl = 'https://blockapi.turtlepay.io/block/header/top'
const creationQueue = 'request.wallet'
const scanQueue = 'scan.wallet'

const publicRabbitHost = process.env.RABBIT_PUBLIC_SERVER || 'localhost'
const publicRabbitUsername = process.env.RABBIT_PUBLIC_USERNAME || ''
const publicRabbitPassword = process.env.RABBIT_PUBLIC_PASSWORD || ''

const privateRabbitHost = process.env.RABBIT_PRIVATE_SERVER || 'localhost'
const privateRabbitUsername = process.env.RABBIT_PRIVATE_USERNAME || ''
const privateRabbitPassword = process.env.RABBIT_PRIVATE_PASSWORD || ''

function log (message) {
  console.log(util.format('%s: %s', (new Date()).toUTCString(), message))
}

function spawnNewWorker () {
  cluster.fork()
}

function buildConnectionString (host, username, password) {
  var result = ['amqp://']

  if (username.length !== 0 && password.length !== 0) {
    result.push(username + ':')
    result.push(password + '@')
  }

  result.push(host)

  return result.join('')
}

if (cluster.isMaster) {
  for (var cpuThread = 0; cpuThread < cpuCount; cpuThread++) {
    spawnNewWorker()
  }

  cluster.on('exit', (worker, code, signal) => {
    log(util.format('worker %s died', worker.process.pid))
    spawnNewWorker()
  })
} else if (cluster.isWorker) {
  (async function () {
    try {
      var incoming = await RabbitMQ.connect(buildConnectionString(publicRabbitHost, publicRabbitUsername, publicRabbitPassword))
      var incomingChannel = await incoming.createChannel()

      var outgoing = await RabbitMQ.connect(buildConnectionString(privateRabbitHost, privateRabbitUsername, privateRabbitPassword))
      var outgoingChannel = await outgoing.createChannel()

      await incomingChannel.assertQueue(creationQueue)
      await outgoingChannel.assertQueue(scanQueue, {
        durable: true
      })

      incomingChannel.consume(creationQueue, (message) => {
        if (message !== null) {
          var newAddress = cryptoUtils.createNewAddress()

          request({
            url: topBlockUrl,
            json: true
          }).then((topBlock) => {
            log(util.format('Worker #%s: Created new wallet %s at height %s for %s', cluster.worker.id, newAddress.address, topBlock.height, message.properties.correlationId))

            incomingChannel.sendToQueue(message.properties.replyTo, Buffer.from(newAddress.address), {
              correlationId: message.properties.correlationId
            })

            const scanRequest = {
              wallet: newAddress,
              scanHeight: topBlock.height,
              request: JSON.parse(message.content.toString())
            }

            outgoingChannel.sendToQueue(scanQueue, Buffer.from(JSON.stringify(scanRequest)), { persistent: true })

            incomingChannel.ack(message)
          }).catch((error) => {
            log(util.format('Worker #%s: Could not create new wallet [%s]', cluster.worker.id, error.toString()))
            incomingChannel.nack(message)
          })
        }
      })
    } catch (e) {
      log(util.format('Error in worker #%s: %s', cluster.worker.id, e.toString()))
      cluster.worker.kill()
    }

    log(util.format('Worker #%s awaiting requests', cluster.worker.id))
  }())
}
