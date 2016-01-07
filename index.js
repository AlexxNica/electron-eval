'use strict'

var electron = require('electron-prebuilt')
var spawn = require('child_process').spawn
var json = require('newline-json')
var path = require('path')
var EventEmitter = require('events').EventEmitter

module.exports = function (opts) {
  return new Daemon(opts)
}

var daemonMain = path.join(__dirname, 'daemon.js')

class Daemon extends EventEmitter {
  constructor (opts) {
    super()
    opts = opts || {}
    opts.timeout = typeof opts.timeout === 'number' ? opts.timeout : 4000
    this.child = spawn(electron, [ daemonMain ])
    this.stdout = this.child.stdout.pipe(json.Parser())
    this.stdin = json.Stringifier()
    this.stdin.pipe(this.child.stdin)

    this.stdin.write(opts)
    this.keepaliveInterval = setInterval(this.keepalive.bind(this), opts.timeout / 2)

    this.queue = []
    this.ready = false
    this.stdout.once('data', () => {
      this.stdout.on('data', message => this.emit(message.id, message))
      this.ready = true
      this.queue.forEach(item => this.eval(item.code, item.cb))
      this.queue = null
      this.emit('ready')
    })
  }

  eval (code, cb) {
    var id = generateId()
    this.once(id, res => {
      if (res.err) var err = new Error(res.err)
      if (cb) {
        if (res.err) return cb(err)
        return cb(null, res.res)
      }
      this.emit('error', err)
    })
    if (!this.ready) return this.queue.push({ code, cb })
    this.stdin.write({ id, code })
  }

  keepalive () {
    this.stdin.write(0)
  }

  close (signal) {
    this.child.kill(signal)
  }
}

function generateId () {
  return Math.random().toString(36).slice(3)
}
