// Copyright (c) 2018, TurtlePay Developers
//
// Please see the included LICENSE file for more information.

'use strict'

const childProcess = require('child_process')

/* Copy these into environment variables so that we
   can pass them to our child workers */
const env = {
  RABBIT_PUBLIC_SERVER: process.env.RABBIT_PUBLIC_SERVER || 'localhost',
  RABBIT_PUBLIC_USERNAME: process.env.RABBIT_PUBLIC_USERNAME || '',
  RABBIT_PUBLIC_PASSWORD: process.env.RABBIT_PUBLIC_PASSWORD || '',
  RABBIT_PRIVATE_SERVER: process.env.RABBIT_PRIVATE_SERVER || 'localhost',
  RABBIT_PRIVATE_USERNAME: process.env.RABBIT_PRIVATE_USERNAME || '',
  RABBIT_PRIVATE_PASSWORD: process.env.RABBIT_PRIVATE_PASSWORD || ''
}

const spawn = function (name, script) {
  var child = childProcess.spawn('node', [ script ], {
    cwd: process.cwd(),
    env: env
  })
  child.stdout.on('data', (data) => {
    data.toString().trim().split(/\r?\n/).forEach((message) => {
      console.log('[%s] %s', name, message.trim())
    })
  })
  child.on('exit', () => {
    spawn(name, script)
  })
}

console.log('Starting TurtlePay wallet workers...')

/* Spawn the wallet creator */
spawn('CREATOR', 'walletCreator.js')

/* Spawn the wallet scanner */
spawn('SCANNER', 'walletScanner.js')

/* Spawn the wallet sender */
spawn('SENDER ', 'walletSender.js')
