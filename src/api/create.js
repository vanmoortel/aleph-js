import axios from 'axios'
import {DEFAULT_SERVER} from './base'
import * as nuls2 from './nuls2'
import * as ethereum from './ethereum'
import * as cosmos from './cosmos'
import * as substrate from './substrate'
import * as solana from './solana'
import * as avalanche from './avalanche'
import FormDataNode from 'form-data'
const shajs = require('sha.js')

const isBrowser = typeof FormData !== 'undefined'

export async function put_content(
  message, content, inline_requested, storage_engine, api_server) {

  let inline = inline_requested
  if (inline) {
    let serialized = JSON.stringify(content)
    if (serialized.length > 150000) {
      inline = false
    } else {
      message['item_type'] = 'inline'
      message['item_content'] = serialized
      message['item_hash'] = new shajs.sha256().update(serialized).digest('hex')
    }
  }
  if (!inline) {
    let hash = ''
    if (storage_engine === 'ipfs') {
      message['item_type'] = 'ipfs'
      hash = await ipfs_push(content, {api_server: api_server})
    } else {
      message['item_type'] = 'storage'
      hash = await storage_push(content, {api_server: api_server})
    }
    message['item_hash'] = hash
  }
}

export async function ipfs_push (
  value, {api_server = DEFAULT_SERVER} = {}) {
  let response = await axios.post(`${api_server}/api/v0/ipfs/add_json`, value, {
    headers: {
      'Content-Type': 'application/json'
    }
  })
  if (response.data.hash !== undefined) {
    return response.data.hash
  } else {
    return null
  }
}

export async function storage_push (
  value, {api_server = DEFAULT_SERVER} = {}) {
  let response = await axios.post(`${api_server}/api/v0/storage/add_json`,
    value, {
      headers: {
        'Content-Type': 'application/json'
      }
    })
  if (response.data.hash !== undefined) {
    return response.data.hash
  } else {
    return null
  }
}

export async function ipfs_push_file (
  fileobject, {api_server = DEFAULT_SERVER} = {}) {
  let formData = null
  if (isBrowser) {
    formData = new FormData()
    formData.append('file', fileobject)
  } else {
    formData = new FormDataNode()
    formData.append('file', fileobject, 'random.txt') // FileName is required but doesn't have effect
  }

  let response = await axios.post( `${api_server}/api/v0/ipfs/add_file`,
    formData,
    {
      headers: {
        'Content-Type': 'multipart/form-data'
      }
    }
  )

  if (response.data.hash !== undefined) {
    return response.data.hash
  } else {
    return null
  }
}

export async function storage_push_file (
  fileobject, {api_server = DEFAULT_SERVER} = {}) {
  let formData = null
  if (isBrowser) {
    formData = new FormData()
    formData.append('file', fileobject)
  } else {
    formData = new FormDataNode()
    formData.append('file', fileobject, 'random.txt') // FileName is required but doesn't have effect
  }

  let response = await axios.post( `${api_server}/api/v0/storage/add_file`,
    formData,
    {
      headers: {
        'Content-Type': `multipart/form-data; boundary=${formData._boundary}`
      }
    }
  )

  if (response.data.hash !== undefined) {
    return response.data.hash
  } else {
    return null
  }
}

export async function broadcast (
  message, {api_server = DEFAULT_SERVER} = {}) {
  let response = await axios.post(`${api_server}/api/v0/ipfs/pubsub/pub`, {
    'topic': 'ALEPH-TEST',
    'data': JSON.stringify(message)
  })
  return response.data.value
}

export async function sign_and_broadcast(message, account, api_server) {
  if (account) {
    if (!message['chain']) {
      message['chain'] = account['type']
    }
    if (account.type === 'NULS2') {
      await nuls2.sign(account.private_key, message)
    } else if (account.type === 'ETH') {
      await ethereum.sign(account, message)
    } else if (account.type === 'DOT') {
      await substrate.sign(account, message)
    } else if (account.type === 'CSDK') {
      await cosmos.sign(account, message)
    } else if (account.type === 'SOL') {
      await solana.sign(account, message)
    } else if (account.type === 'AVAX') {
      await avalanche.sign(account, message)
    } else
      return message // can't sign, so can't broadcast
    await broadcast(message, { 'api_server': api_server })
  }
}