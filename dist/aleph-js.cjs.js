'use strict';

Object.defineProperty(exports, '__esModule', { value: true });

var axios = require('axios');
var bip39 = require('bip39');
var bip32 = require('bip32');
var cosmosjs = require('@cosmostation/cosmosjs');
var keyring = require('@polkadot/keyring');
var utilCrypto = require('@polkadot/util-crypto');
var web3_js = require('@solana/web3.js');
var nacl$1 = require('tweetnacl');
var base58 = require('bs58');
var createHash = require('create-hash');
var avalanche$1 = require('avalanche');
var FormDataNode = require('form-data');
var eciesjs = require('eciesjs');

function _interopDefaultLegacy (e) { return e && typeof e === 'object' && 'default' in e ? e : { 'default': e }; }

var axios__default = /*#__PURE__*/_interopDefaultLegacy(axios);
var cosmosjs__default = /*#__PURE__*/_interopDefaultLegacy(cosmosjs);
var nacl__default = /*#__PURE__*/_interopDefaultLegacy(nacl$1);
var base58__default = /*#__PURE__*/_interopDefaultLegacy(base58);
var createHash__default = /*#__PURE__*/_interopDefaultLegacy(createHash);
var FormDataNode__default = /*#__PURE__*/_interopDefaultLegacy(FormDataNode);

var DEFAULT_SERVER = 'https://api1.aleph.im';

const secp256k1 = require('secp256k1');
const RIPEMD160 = require('ripemd160');
const bs58 = require('bs58');
const shajs = require('sha.js');

var hexRegEx = /([0-9]|[a-f])/gim;

function isHex (input) {
  return typeof input === 'string' &&
    (input.match(hexRegEx) || []).length === input.length
}

function getxor (body) {
  // my current/simple method
  // assume 'buf1', 'buf2' & 'result' are ArrayBuffers
  let xor = 0;
  for (var i = 0; i < body.length; i++) {
    xor = xor ^ body[i];
  }
  return xor
}

function write_with_length (val, buf, cursor) {
  let llen = write_varint(val.length, buf, cursor);
  let slen = val.copy(buf, cursor + llen);
  return llen + slen
}

function write_varint (value, buf, cursor) {
  let len = 1;
  if (value < 253) {
    // ob = new Buffer.from([self.value]);
    buf[cursor] = value;
  } else if (value <= 0xFFFF) {
    // ob = new Buffer.allocUnsafe(3);
    buf[cursor] = 253;
    buf.writeUIntLE(value, cursor + 1, 2);
    len = 3;
  } else if (value <= 0xFFFFFFFF) {
    buf[cursor] = 254;
    buf.writeUIntLE(value, cursor + 1, 4);
    len = 5;
  } else {
    throw "not implemented"
  }
  return len
}

function private_key_to_public_key (prv) {
  return secp256k1.publicKeyCreate(prv)
}

function public_key_to_hash (pub, { chain_id = 1, address_type = 1 } = {}) {
  let sha = new shajs.sha256().update(pub).digest();
  let pubkeyHash = new RIPEMD160().update(sha).digest();
  let output = Buffer.allocUnsafe(3);
  output.writeInt16LE(chain_id, 0);
  output.writeInt8(address_type, 2);
  return Buffer.concat([output, pubkeyHash]) //.toString('hex')
}

function address_from_hash (hash, { prefix = 'NULS' } = {}) {
  //const bytes = Buffer.from(hash, 'hex')
  const address = bs58.encode(Buffer.concat([hash, new Buffer([getxor(hash)])]));
  return prefix + String.fromCharCode(prefix.length+96) + address
}

function hash_twice (buffer) {
  let sha =  new shajs.sha256().update(buffer).digest();
  sha =  new shajs.sha256().update(sha).digest();
  return sha;
}

function hash_from_address (address) {
  let hash = bs58.decode(address);
  return hash.slice(0, hash.length - 1) //.toString('hex')
}


function get_verification_buffer(message) {
  // Returns a serialized string to verify the message integrity
  return Buffer.from(`${message.chain}\n${message.sender}\n${message.type}\n${message.item_hash}`)
}

function magic_hash(message, messagePrefix) {
  messagePrefix = messagePrefix || '\u0018NULS Signed Message:\n';
  if (!Buffer.isBuffer(messagePrefix)) messagePrefix = Buffer.from(messagePrefix);

  //var messageVISize = varuint.encodingLength(message.length)
  var buffer = Buffer.allocUnsafe(messagePrefix.length + 6 + message.length);
  var cursor = messagePrefix.copy(buffer, 0);
  cursor += write_varint(message.length, buffer, cursor);
  cursor += Buffer.from(message).copy(buffer, cursor);
  buffer = buffer.slice(0, cursor);
  return new shajs.sha256().update(buffer).digest()
}


function encodeSignature (signature, recovery, compressed) {
  if (compressed) recovery += 4;
  return Buffer.concat([Buffer.alloc(1, recovery + 27), signature])
}  

async function sign(prv_key, message) {
  let digest = magic_hash(get_verification_buffer(message));

  if (typeof prv_key === 'string' || prv_key instanceof String)
    prv_key = Buffer.from(prv_key, 'hex');

  const sigObj = secp256k1.sign(digest, prv_key);
  let signature = encodeSignature(
    sigObj.signature,
    sigObj.recovery,
    false
  );
  message.signature = signature.toString('base64');
  return message

  //   let pub_key = secp256k1.publicKeyCreate(prv_`key)

  //   let sigObj = secp256k1.sign(digest, prv_key)
  //   let signed = secp256k1.signatureExport(sigObj.signature)

  //   let buf = Buffer.alloc(3 + pub_key.length + signed.length)
  //   let cursor = write_with_length(pub_key, buf, 0)
  //   cursor += 1 // we let a zero there for alg ECC type
  //   cursor += write_with_length(signed, buf, cursor)

  //   message.signature = buf.toString('hex')`
}

function check_pkey(private_key) {
  if (!isHex(private_key)) { return false }
  if (!private_key) { return false }
  if ((private_key.length === 66) && (private_key.substring(0, 2) === '00')) {
    private_key = private_key.substring(2, 66);
  }
  if (private_key.length !== 64) { return false }
  try {
    let prvbuffer = Buffer.from(private_key, 'hex');
    let pub = private_key_to_public_key(prvbuffer);
  } catch (e) {
    return false
  }
  return private_key
}

async function new_account({chain_id = 1, prefix='NULS'} = {}) {
  let mnemonics =  bip39.generateMnemonic();
  return import_account({
    'mnemonics': mnemonics,
    'chain_id': chain_id,
    'prefix': prefix
  })
}

async function import_account({
  private_key = null, mnemonics = null, chain_id = 1, prefix = 'NULS',
  name = null} = {}){
    
  if (mnemonics) {
    let v = await bip39.mnemonicToSeed(mnemonics);
    let b = bip32.fromSeed(v);
    private_key = b.privateKey.toString('hex');
  }
  if (private_key !== null) {
    let account = {
      'private_key': private_key,
      'mnemonics': mnemonics,
      'type': 'NULS2'
    };
    let prvbuffer = Buffer.from(private_key, 'hex');
    let pub = private_key_to_public_key(prvbuffer);
    account['public_key'] = pub.toString('hex');
    let hash = public_key_to_hash(pub, {
      'chain_id': chain_id
    });
    account['address'] = address_from_hash(hash, {
      'prefix': prefix
    });
    if (name)
      account['name'] = name;
    else
      account['name'] = account['address'];

    return account
  }
  return null
}

var nuls2 = /*#__PURE__*/Object.freeze({
  __proto__: null,
  write_with_length: write_with_length,
  write_varint: write_varint,
  private_key_to_public_key: private_key_to_public_key,
  public_key_to_hash: public_key_to_hash,
  address_from_hash: address_from_hash,
  hash_twice: hash_twice,
  hash_from_address: hash_from_address,
  sign: sign,
  check_pkey: check_pkey,
  new_account: new_account,
  import_account: import_account
});

const ethers = require('ethers');

function get_verification_buffer$1(message) {
  // Returns a serialized string to verify the message integrity
  return Buffer.from(`${message.chain}\n${message.sender}\n${message.type}\n${message.item_hash}`)
}

async function w3_sign(w3, address, message) {
  let buffer = get_verification_buffer$1(message);
  let signed = await w3.eth.personal.sign(buffer.toString(), address, '');
  message.signature = signed;
  return message
}

async function sign$1(account, message) {
  let buffer = get_verification_buffer$1(message);
  let signer = account.signer;
  if (!(signer&&signer.signMessage)) {
    if (account.private_key) {
      signer = new ethers.Wallet(account.private_key);
    }
  }
  let signed = null;
  if (account.provider && account.provider.provider && account.provider.provider.isWalletConnect) {
    signed = await account.provider.provider.request({ 
      method: 'personal_sign',
      params: [
        buffer,
        account.address
      ]});
  } else if (signer) {
    signed = await signer.signMessage(buffer.toString());
  }
  message.signature = signed;
  return message
}

async function new_account$1({path = "m/44'/60'/0'/0/0"} = {}) {
  let mnemonics = bip39.generateMnemonic();
  return import_account$1({
    'mnemonics': mnemonics,
    'path': path
  })
}


async function _from_wallet(wallet, name) {
  if (wallet) {
    let account = {
      'private_key': wallet.privateKey,
      'public_key': wallet.signingKey.keyPair.compressedPublicKey,
      'mnemonics': wallet.mnemonic,
      'address': wallet.address,
      'type': 'ETH',
      'source': 'integrated',
      'signer': wallet
    };
    if (name)
      account['name'] = name;
    else
      account['name'] = account['address'];

    return account
  }
  return null
}

async function import_account$1({
  private_key = null, mnemonics = null, path = "m/44'/60'/0'/0/0",
  name = null} = {}){
  
  let wallet = null;
  if (mnemonics) {
    wallet = ethers.Wallet.fromMnemonic(mnemonics, path);
  } else if (private_key !== null) {
    wallet = new ethers.Wallet(private_key);
  }
  return await _from_wallet(wallet, name)
}

async function from_provider(provider) {
  // You should likely pass web3.currentProvider
  const ethprovider = new ethers.providers.Web3Provider(provider);

  // There is only ever up to one account in MetaMask exposed
  const signer = ethprovider.getSigner();
  const address = await signer.getAddress();
  return {
    'private_key': null,
    'mnemonics': null,
    'address': address,
    'name': address,
    'type': 'ETH',
    'source': 'provider',
    'provider': ethprovider,
    'signer': signer
  }
}

var ethereum = /*#__PURE__*/Object.freeze({
  __proto__: null,
  w3_sign: w3_sign,
  sign: sign$1,
  new_account: new_account$1,
  import_account: import_account$1,
  from_provider: from_provider
});

const secp256k1$1 = require('secp256k1');

const CHAIN_ID = "signed-message-v1";

function get_verification_inner_string(message) {
  // Returns a serialized string to verify the message integrity
  return `${message.chain}\n${message.sender}\n${message.type}\n${message.item_hash}`
}

function get_signable_message(message) {
    let signable = get_verification_inner_string(message);
    let content_message = {
        "type": "signutil/MsgSignText",
        "value": {
            "message": signable,
            "signer": message['sender'],
        }
    };
    
    return {
        "chain_id": CHAIN_ID,
        "account_number": "0",
        "fee": {
            "amount": [],
            "gas": "0",
        },
        "memo": "",
        "sequence": "0",
        "msgs": [content_message]
    }
}

async function sign$2(account, message) {
  let signable = get_signable_message(message);
  if (account.source == 'integrated') {
    const cosmos = cosmosjs__default['default'].network("...", CHAIN_ID);
    let signed = cosmos.sign(cosmos.newStdMsg(signable), Buffer.from(account.private_key, 'hex'));
    message['signature'] = JSON.stringify(signed['tx']['signatures'][0]);
  } else if (account.source == "function") {
    message['signature'] = await account.signer(account, message, signable);
  }
  return message
}

async function new_account$2({path = "m/44'/118'/0'/0/0", prefix = "cosmos"} = {}) {
  let mnemonics = bip39.generateMnemonic();
  return import_account$2({
    'mnemonics': mnemonics,
    'path': path,
    'prefix': prefix
  })
}

function private_key_to_public_key$1 (prv) {
  return secp256k1$1.publicKeyCreate(prv)
}

async function import_account$2({
  mnemonics = null, path = "m/44'/118'/0'/0/0", prefix = "cosmos",
  name = null} = {}){

  const cosmos = cosmosjs__default['default'].network("...", CHAIN_ID);
  cosmos.setBech32MainPrefix(prefix);
  cosmos.setPath(path);

  let private_key = cosmos.getECPairPriv(mnemonics);

  let account = {
    'private_key': private_key.toString('hex'),
    'public_key': private_key_to_public_key$1(private_key).toString('hex'),
    'mnemonics': mnemonics,
    'address': cosmos.getAddress(mnemonics),
    'prefix': prefix,
    'path': path,
    'type': 'CSDK',
    'source': 'integrated'
  };
  return account
}

async function from_external_signer({
  address = null, name = null, signer = null, public_key = null} = {}) {
  let account = {
    'public_key': public_key,
    'address': address,
    'type': 'CSDK',
    'source': 'function',
    'signer': signer,
    'name': name
  };
  return account
}

var cosmos = /*#__PURE__*/Object.freeze({
  __proto__: null,
  get_signable_message: get_signable_message,
  sign: sign$2,
  new_account: new_account$2,
  private_key_to_public_key: private_key_to_public_key$1,
  import_account: import_account$2,
  from_external_signer: from_external_signer
});

function get_verification_buffer$2(message) {
  // Returns a serialized string to verify the message integrity
  return Buffer.from(`${message.chain}\n${message.sender}\n${message.type}\n${message.item_hash}`)
}

async function sign$3(account, message) {
  let buffer = get_verification_buffer$2(message);
  let signer = account.signer;
  if (!(signer&&signer.sign)) {
    let keyring$1 = new keyring.Keyring({ type: 'sr25519' });
    if (account.mnemonics) {
      signer = keyring$1.createFromUri(account.mnemonics, { name: 'sr25519' });
    } else if (account.private_key) {
      signer = keyring$1.createFromUri(account.private_key, { name: 'sr25519' });
    }
  }

  if (signer) {
    let signed = "0x" + Buffer.from(signer.sign(buffer)).toString('hex');
    let signate_object = JSON.stringify({
      'curve': 'sr25519',
      'data': signed
    });
    message.signature = signate_object;
    return message
  }
}

async function new_account$3({format = 42} = {}) {
  let mnemonics = utilCrypto.mnemonicGenerate();
  return import_account$3({
    'mnemonics': mnemonics,
    'format': format
  })
}

async function import_account$3({
  private_key = null, mnemonics = null, format=42,
  name = null} = {}){

  await utilCrypto.cryptoWaitReady();

  let keyring$1 = new keyring.Keyring({ type: 'sr25519', ss58Format: format });
  
  let pair = null;

  if (mnemonics) {
    pair = keyring$1.createFromUri(mnemonics, { name: 'sr25519' });
  } else if (private_key !== null) {
    pair = keyring$1.createFromUri(private_key, { name: 'sr25519' });
  }

  let account = {
    'keyring': keyring$1,
    'private_key': pair.secretKey,
    'public_key': pair.publicKey,
    'mnemonics': mnemonics,
    'address': pair.address,
    'address_format': format,
    'type': 'DOT',
    'source': 'integrated',
    'signer': pair
  };
  if (name)
    account['name'] = name;
  else
    account['name'] = account['address'];
  
  return account
}

var substrate = /*#__PURE__*/Object.freeze({
  __proto__: null,
  sign: sign$3,
  new_account: new_account$3,
  import_account: import_account$3
});

require('ethers');

function get_verification_buffer$3(message) {
  // Returns a serialized string to verify the message integrity
  return Buffer.from(`${message.chain}\n${message.sender}\n${message.type}\n${message.item_hash}`)
}

async function provider_sign(provider, message) {
  let buffer = get_verification_buffer$3(message);
  let signed = await provider._sendRequest('signTransaction', {
    message: base58__default['default'].encode(buffer),
  });
  return JSON.stringify(signed)
}

async function pkey_sign(secretKey, address, message) {
  let buffer = get_verification_buffer$3(message);
  const signature = nacl__default['default'].sign.detached(buffer, base58__default['default'].decode(secretKey));
  return JSON.stringify({
    'signature': base58__default['default'].encode(signature),
    publicKey: address
  })
}

async function sign$4(account, message) {
  get_verification_buffer$3(message);
  let signed = null;
  if (account.private_key) {
    signed = await pkey_sign(account.private_key, account.address, message);
  } else if (account.provider) {
    signed = await provider_sign(account.provider, message);
  }

  message.signature = signed;
  return message
}

async function new_account$4({path = "m/44'/60'/0'/0/0"} = {}) {
  let account = new web3_js.Keypair();
  console.log(account);
  return import_account$4({
    'private_key': base58__default['default'].encode(account.secretKey)
  })
}


async function _from_wallet$1(wallet, name) {
  if (wallet) {
    let account = {
      'private_key': base58__default['default'].encode(wallet.secretKey),
      'public_key': wallet.publicKey.toString(),
      'address': wallet.publicKey.toString(),
      'type': 'SOL',
      'source': 'integrated',
      'signer': wallet
    };
    if (name)
      account['name'] = name;
    else
      account['name'] = account['address'];

    return account
  }
  return null
}

async function import_account$4({
  private_key = null, name = null} = {}){
  
  let wallet = null;
  if (private_key !== null) {
    wallet = web3_js.Keypair.fromSecretKey(base58__default['default'].decode(private_key));
  }
  return await _from_wallet$1(wallet, name)
}

async function from_provider$1(provider) {
  // You should likely pass Wallet from '@project-serum/sol-wallet-adapter'
  return {
    'private_key': null,
    'public_key': provider.publicKey.toString(),
    'address': provider.publicKey.toString(),
    'name': provider.publicKey.toString(),
    'type': 'SOL',
    'source': 'provider',
    'provider': provider
  }
}

var solana = /*#__PURE__*/Object.freeze({
  __proto__: null,
  provider_sign: provider_sign,
  pkey_sign: pkey_sign,
  sign: sign$4,
  new_account: new_account$4,
  import_account: import_account$4,
  from_provider: from_provider$1
});

function get_verification_buffer$4(message) {
  // Returns a serialized string to verify the message integrity
  return Buffer.from(`${message.chain}\n${message.sender}\n${message.type}\n${message.item_hash}`)
}

async function get_keychain() {
  let ava = new avalanche$1.Avalanche();
  let xchain = ava.XChain();
  return xchain.keyChain()
}

async function get_keypair(private_key = null) {
  let keychain = await get_keychain();
  let keypair = keychain.makeKey();
  if (private_key !== null) {
    let priv = Buffer.from(private_key, 'hex');
    keypair.importKey(priv);
  }
  return keypair
}


async function digestMessage(mBuf) {
  // let mBuf = Buffer.from(msgStr, 'utf8')
  let msgSize = Buffer.alloc(4);
  let msgStr = mBuf.toString("utf-8");
  msgSize.writeUInt32BE(mBuf.length, 0);
  let msgBuf = Buffer.from(`\x1AAvalanche Signed Message:\n${msgSize}${msgStr}`, 'utf8');
  return createHash__default['default']('sha256').update(msgBuf).digest()
}


async function sign$5(account, message) {
  let buffer = get_verification_buffer$4(message);
  console.log(buffer);
  let bintools = avalanche$1.BinTools.getInstance();
  let signed = null;
  let keypair = null;
  if ((account.signer !== undefined)&&(account.signer)) {
    keypair = account.signer;
  } else  if (account.private_key) {
    keypair = await get_keypair(account.private_key);
  }

  let digest = await digestMessage(buffer);
  console.log(digest.toString());

  let digestHex = digest.toString('hex');
  let digestBuff = Buffer.from(digestHex, 'hex');
  signed = keypair.sign(digestBuff);

  signed = bintools.cb58Encode(signed);

  message.signature = signed;
  console.log(message);
  return message
}


async function new_account$5({} = {}) {
  return await _from_keypair(await get_keypair(null))
}


async function _from_keypair(keypair, name) {
  if (keypair) {
    let account = {
      'private_key': keypair.getPrivateKey().toString('hex'),
      'public_key': keypair.getPublicKey().toString('hex'),
      'address': keypair.getAddressString(),
      'type': 'AVAX',
      'source': 'integrated',
      'signer': keypair
    };
    if (name)
      account['name'] = name;
    else
      account['name'] = account['address'];

    return account
  }
  return null
}

async function import_account$5({
  private_key = null, name = null} = {}){

  return await _from_keypair(await get_keypair(private_key), name)
}

var avalanche = /*#__PURE__*/Object.freeze({
  __proto__: null,
  sign: sign$5,
  new_account: new_account$5,
  import_account: import_account$5
});

const shajs$1 = require('sha.js');

const isBrowser = typeof FormData !== 'undefined';

async function put_content(
  message, content, inline_requested, storage_engine, api_server) {

  let inline = inline_requested;
  if (inline) {
    let serialized = JSON.stringify(content);
    if (serialized.length > 150000) {
      inline = false;
    } else {
      message['item_type'] = 'inline';
      message['item_content'] = serialized;
      message['item_hash'] = new shajs$1.sha256().update(serialized).digest('hex');
    }
  }
  if (!inline) {
    let hash = '';
    if (storage_engine === 'ipfs') {
      message['item_type'] = 'ipfs';
      hash = await ipfs_push(content, {api_server: api_server});
    } else {
      message['item_type'] = 'storage';
      hash = await storage_push(content, {api_server: api_server});
    }
    message['item_hash'] = hash;
  }
}

async function ipfs_push (
  value, {api_server = DEFAULT_SERVER} = {}) {
  let response = await axios__default['default'].post(`${api_server}/api/v0/ipfs/add_json`, value, {
    headers: {
      'Content-Type': 'application/json'
    }
  });
  if (response.data.hash !== undefined) {
    return response.data.hash
  } else {
    return null
  }
}

async function storage_push (
  value, {api_server = DEFAULT_SERVER} = {}) {
  let response = await axios__default['default'].post(`${api_server}/api/v0/storage/add_json`,
    value, {
      headers: {
        'Content-Type': 'application/json'
      }
    });
  if (response.data.hash !== undefined) {
    return response.data.hash
  } else {
    return null
  }
}

async function ipfs_push_file (
  fileobject, {api_server = DEFAULT_SERVER} = {}) {
  let formData = null;
  if (isBrowser) {
    formData = new FormData();
    formData.append('file', fileobject);
  } else {
    formData = new FormDataNode__default['default']();
    formData.append('file', fileobject, 'random.txt'); // FileName is required but doesn't have effect
  }

  let response = await axios__default['default'].post( `${api_server}/api/v0/ipfs/add_file`,
    formData,
    {
      headers: {
        'Content-Type': 'multipart/form-data'
      }
    }
  );

  if (response.data.hash !== undefined) {
    return response.data.hash
  } else {
    return null
  }
}

async function storage_push_file (
  fileobject, {api_server = DEFAULT_SERVER} = {}) {
  let formData = null;
  if (isBrowser) {
    formData = new FormData();
    formData.append('file', fileobject);
  } else {
    formData = new FormDataNode__default['default']();
    formData.append('file', fileobject, 'random.txt'); // FileName is required but doesn't have effect
  }

  let response = await axios__default['default'].post( `${api_server}/api/v0/storage/add_file`,
    formData,
    {
      headers: {
        'Content-Type': `multipart/form-data; boundary=${formData._boundary}`
      }
    }
  );

  if (response.data.hash !== undefined) {
    return response.data.hash
  } else {
    return null
  }
}

async function broadcast (
  message, {api_server = DEFAULT_SERVER} = {}) {
  let response = await axios__default['default'].post(`${api_server}/api/v0/ipfs/pubsub/pub`, {
    'topic': 'ALEPH-TEST',
    'data': JSON.stringify(message)
  });
  return response.data.value
}

async function sign_and_broadcast(message, account, api_server) {
  if (account) {
    if (!message['chain']) {
      message['chain'] = account['type'];
    }
    if (account.type === 'NULS2') {
      await sign(account.private_key, message);
    } else if (account.type === 'ETH') {
      await sign$1(account, message);
    } else if (account.type === 'DOT') {
      await sign$3(account, message);
    } else if (account.type === 'CSDK') {
      await sign$2(account, message);
    } else if (account.type === 'SOL') {
      await sign$4(account, message);
    } else if (account.type === 'AVAX') {
      await sign$5(account, message);
    } else
      return message // can't sign, so can't broadcast
    await broadcast(message, { 'api_server': api_server });
  }
}

require('sha.js');

async function fetch_one(address, key, {api_server = DEFAULT_SERVER} = {}) {
  let response = await axios__default['default'].get(`${api_server}/api/v0/aggregates/${address}.json?keys=${key}`);
  if ((response.data.data !== undefined) && (response.data.data[key] !== undefined))
  {
    return response.data.data[key]
  } else
    return null
}

async function fetch(address, {keys = null, api_server = DEFAULT_SERVER} = {}) {

  if (keys !== null)
    keys = keys.join(',');

  let response = await axios__default['default'].get(
    `${api_server}/api/v0/aggregates/${address}.json`,
    {
      params: {keys: keys}
    });
  if ((response.data.data !== undefined))
  {
    return response.data.data
  } else
    return null
}

async function fetch_profile(address, {api_server = DEFAULT_SERVER} = {}) {
  return await fetch_one(address, ['profile'], {'api_server': api_server})
}

async function submit(
  address, key, content, {
    chain=null, channel=null, api_server = DEFAULT_SERVER,
    inline = true, storage_engine='storage', account = null} = {}) {
                              
  let aggregate_content = {
    'address': address,
    'key': key,
    'content': content,
    'time': Date.now() / 1000
  };
  let message = {
    'chain': chain,
    'channel': channel,
    'sender': address,
    'type': 'AGGREGATE',
    'time': Date.now() / 1000
  };
  await put_content(message, aggregate_content, inline, storage_engine, api_server);

  await sign_and_broadcast(message, account, api_server);

  return message
}

var aggregates = /*#__PURE__*/Object.freeze({
  __proto__: null,
  fetch_one: fetch_one,
  fetch: fetch,
  fetch_profile: fetch_profile,
  submit: submit
});

const secp256k1$2 = require('secp256k1');
const RIPEMD160$1 = require('ripemd160');
const bs58$1 = require('bs58');
const shajs$2 = require('sha.js');

var hexRegEx$1 = /([0-9]|[a-f])/gim;

function isHex$1 (input) {
  return typeof input === 'string' &&
    (input.match(hexRegEx$1) || []).length === input.length
}

function getxor$1 (body) {
  // my current/simple method
  // assume 'buf1', 'buf2' & 'result' are ArrayBuffers
  let xor = 0;
  for (var i = 0; i < body.length; i++) {
    xor = xor ^ body[i];
  }
  return xor
}

function write_with_length$1 (val, buf, cursor) {
  let llen = write_varint$1(val.length, buf, cursor);
  let slen = val.copy(buf, cursor + llen);
  return llen + slen
}

function write_varint$1 (value, buf, cursor) {
  let len = 1;
  if (value < 253) {
    // ob = new Buffer.from([self.value]);
    buf[cursor] = value;
  } else if (value <= 0xFFFF) {
    // ob = new Buffer.allocUnsafe(3);
    buf[cursor] = 253;
    buf.writeUIntLE(value, cursor + 1, 2);
    len = 3;
  } else if (value <= 0xFFFFFFFF) {
    buf[cursor] = 254;
    buf.writeUIntLE(value, cursor + 1, 4);
    len = 5;
  } else {
    throw "not implemented"
  }
  return len
}

function private_key_to_public_key$2 (prv) {
  return secp256k1$2.publicKeyCreate(prv)
}

function public_key_to_hash$1 (pub, { chain_id = 8964, address_type = 1 } = {}) {
  let sha = new shajs$2.sha256().update(pub).digest();
  let pubkeyHash = new RIPEMD160$1().update(sha).digest();
  let output = Buffer.allocUnsafe(3);
  output.writeInt16LE(chain_id, 0);
  output.writeInt8(address_type, 2);
  return Buffer.concat([output, pubkeyHash]) //.toString('hex')
}

function address_from_hash$1 (hash) {
  //const bytes = Buffer.from(hash, 'hex')
  const address = bs58$1.encode(Buffer.concat([hash, new Buffer([getxor$1(hash)])]));
  return address
}

function hash_twice$1 (buffer) {
  let sha =  new shajs$2.sha256().update(buffer).digest();
  sha =  new shajs$2.sha256().update(sha).digest();
  return sha;
}

function hash_from_address$1 (address) {
  let hash = bs58$1.decode(address);
  return hash.slice(0, hash.length - 1) //.toString('hex')
}


function get_verification_buffer$5(message) {
  // Returns a serialized string to verify the message integrity
  return Buffer.from(`${message.chain}\n${message.sender}\n${message.type}\n${message.item_hash}`)
}

function magic_hash$1(message, messagePrefix) {
  messagePrefix = messagePrefix || '\u0018NULS Signed Message:\n';
  if (!Buffer.isBuffer(messagePrefix)) messagePrefix = Buffer.from(messagePrefix);

  //var messageVISize = varuint.encodingLength(message.length)
  var buffer = Buffer.allocUnsafe(messagePrefix.length + 6 + message.length);
  var cursor = messagePrefix.copy(buffer, 0);
  cursor += write_varint$1(message.length, buffer, cursor);
  cursor += Buffer.from(message).copy(buffer, cursor);
  buffer = buffer.slice(0, cursor);
  console.log(buffer.toString('utf8'));
  return new shajs$2.sha256().update(buffer).digest()
}

function sign$6(prv_key, message) {
  if (typeof prv_key === 'string' || prv_key instanceof String)
    prv_key = Buffer.from(prv_key, 'hex');

  let digest = magic_hash$1(get_verification_buffer$5(message));

  let pub_key = secp256k1$2.publicKeyCreate(prv_key);

  let sigObj = secp256k1$2.sign(digest, prv_key);
  let signed = secp256k1$2.signatureExport(sigObj.signature);

  let buf = Buffer.alloc(3 + pub_key.length + signed.length);
  let cursor = write_with_length$1(pub_key, buf, 0);
  cursor += 1; // we let a zero there for alg ECC type
  cursor += write_with_length$1(signed, buf, cursor);

  message.signature = buf.toString('hex');
  return message
}

function check_pkey$1(private_key) {
  if (!isHex$1(private_key)) { return false }
  if (!private_key) { return false }
  if ((private_key.length === 66) && (private_key.substring(0, 2) === '00')) {
    private_key = private_key.substring(2, 66);
  }
  if (private_key.length !== 64) { return false }
  try {
    let prvbuffer = Buffer.from(private_key, 'hex');
    let pub = private_key_to_public_key$2(prvbuffer);
  } catch (e) {
    return false
  }
  return private_key
}

var nuls = /*#__PURE__*/Object.freeze({
  __proto__: null,
  write_with_length: write_with_length$1,
  write_varint: write_varint$1,
  private_key_to_public_key: private_key_to_public_key$2,
  public_key_to_hash: public_key_to_hash$1,
  address_from_hash: address_from_hash$1,
  hash_twice: hash_twice$1,
  hash_from_address: hash_from_address$1,
  sign: sign$6,
  check_pkey: check_pkey$1
});

require('sha.js');

async function get_posts(
  types, {
    api_server = DEFAULT_SERVER, pagination = 200, page=1,
    refs = null, addresses = null, tags = null, hashes = null} = {}) {
  let params = {
    'types': types,
    'pagination': pagination,
    'page': page
  };

  if (refs !== null)
    params.refs = refs.join(',');

  if (addresses !== null)
    params.addresses = addresses.join(',');

  if (tags !== null)
    params.tags = tags.join(',');

  if (hashes !== null)
    params.hashes = hashes.join(',');

  let response = await axios__default['default'].get(`${api_server}/api/v0/posts.json`, {
    'params': params
  });
  return response.data
}

async function submit$1(
  address, post_type, content, {
    api_server = DEFAULT_SERVER, ref = null, chain = null, channel = null,
    inline = true, storage_engine='storage', account = null} = {}) {
  let post_content = {
    'type': post_type,
    'address': address,
    'content': content,
    'time': Date.now() / 1000
  };

  if (ref !== null)
    post_content['ref'] = ref;

  let message = {
    'chain': chain,
    'channel': channel,
    'sender': address,
    'type': 'POST',
    'time': Date.now() / 1000
  };
  await put_content(message, post_content, inline, storage_engine, api_server);

  await sign_and_broadcast(message, account, api_server);
  return message
}

var posts = /*#__PURE__*/Object.freeze({
  __proto__: null,
  get_posts: get_posts,
  submit: submit$1
});

async function get_messages(
    { api_server = DEFAULT_SERVER, pagination = 200, page=1,
      message_type = null, content_types = null,
      refs = null, addresses = null, tags = null, hashes = null} = {}) {
    let params = {
      'pagination': pagination,
      'page': page
    };

    if (message_type !== null)
      params.msgType = message_type;
  
    if (content_types !== null)
      params.contentTypes = content_types.join(',');
  
    if (refs !== null)
      params.refs = refs.join(',');
  
    if (addresses !== null)
      params.addresses = addresses.join(',');
  
    if (tags !== null)
      params.tags = tags.join(',');
  
    if (hashes !== null)
      params.hashes = hashes.join(',');
  
    let response = await axios__default['default'].get(`${api_server}/api/v0/messages.json`, {
      'params': params
    });
    return response.data
  }

var messages = /*#__PURE__*/Object.freeze({
  __proto__: null,
  get_messages: get_messages
});

async function submit$2(
  address, {
    file_hash = null, fileobject = null,
    storage_engine = 'storage',
    chain = null, channel = null, api_server = DEFAULT_SERVER,
    account = null, extra_fields = {} } = {}) {

  if ((file_hash === null) && (fileobject === null)) {
    throw "You must either provide a hash and an engine or a fileobject" 
  }
  
  if (fileobject !== null) {
    // let's try to upload it ourselves
    if (storage_engine === 'storage') {
      file_hash = await storage_push_file(fileobject, {
        api_server: api_server
      });
    } else if (storage_engine === 'ipfs') {
      file_hash = await ipfs_push_file(fileobject, {
        api_server: api_server
      });
    } else {
      throw "Unsupported storage engine"
    }

    if (file_hash === null) {
      throw "Upload error"
    }
  }

  let store_content = {
    'address': address,
    'item_type': storage_engine,
    'item_hash': file_hash,
    'time': Date.now() / 1000,
    ...extra_fields
  };
  let message = {
    'chain': chain,
    'channel': channel,
    'sender': address,
    'type': 'STORE',
    'time': Date.now() / 1000
  };
  await put_content(message, store_content, true, storage_engine, api_server);

  await sign_and_broadcast(message, account, api_server);

  message['content'] = store_content;

  return message
}

async function retrieve(file_hash, {api_server = DEFAULT_SERVER} = {}) {
  try {
    let response = await axios__default['default'].get(`${api_server}/api/v0/storage/raw/${file_hash}?find`,
      {
        responseType: 'arraybuffer'
      });
    if (response.status === 200) {
      return response.data
    } else {
      return null
    }
  } catch (err) {
    return null
  }
}

var store = /*#__PURE__*/Object.freeze({
  __proto__: null,
  submit: submit$2,
  retrieve: retrieve
});

// Fork from eccrypto/browser.js to use secp256r1.

var EC = require("elliptic").ec;

var ec = new EC("p256");
var browserCrypto = global.crypto || global.msCrypto || {};
var subtle = browserCrypto.subtle || browserCrypto.webkitSubtle;

var nodeCrypto = require('crypto');

const EC_GROUP_ORDER = Buffer.from('fffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141', 'hex');
const ZERO32 = Buffer.alloc(32, 0);

function assert(condition, message) {
  if (!condition) {
    throw new Error(message || "Assertion failed");
  }
}

function isScalar (x) {
  return Buffer.isBuffer(x) && x.length === 32;
}

function isValidPrivateKey(privateKey) {
  if (!isScalar(privateKey))
  {
    return false;
  }
  return privateKey.compare(ZERO32) > 0 && // > 0
  privateKey.compare(EC_GROUP_ORDER) < 0; // < G
}

// Compare two buffers in constant time to prevent timing attacks.
function equalConstTime(b1, b2) {
  if (b1.length !== b2.length) {
    return false;
  }
  var res = 0;
  for (var i = 0; i < b1.length; i++) {
    res |= b1[i] ^ b2[i];  // jshint ignore:line
  }
  return res === 0;
}

/* This must check if we're in the browser or
not, since the functions are different and does
not convert using browserify */
function randomBytes(size) {
  var arr = new Uint8Array(size);
  if (typeof browserCrypto.getRandomValues === 'undefined') {
    return Buffer.from(nodeCrypto.randomBytes(size));
  } else {
    browserCrypto.getRandomValues(arr);
  }
  return Buffer.from(arr);
}

function sha512(msg) {
  return new Promise(function(resolve) {
    var hash = nodeCrypto.createHash('sha512');
    var result = hash.update(msg).digest();
    resolve(new Uint8Array(result));
  });
}

function getAes(op) {
  return function(iv, key, data) {
    return new Promise(function(resolve) {
      if (subtle) {
        var importAlgorithm = {name: "AES-CBC"};
        var keyp = subtle.importKey("raw", key, importAlgorithm, false, [op]);
        return keyp.then(function(cryptoKey) {
          var encAlgorithm = {name: "AES-CBC", iv: iv};
          return subtle[op](encAlgorithm, cryptoKey, data);
        }).then(function(result) {
          resolve(Buffer.from(new Uint8Array(result)));
        });
      } else {
        if (op === 'encrypt') {
          var cipher = nodeCrypto.createCipheriv('aes-256-cbc', key, iv);
          cipher.update(data);
          resolve(cipher.final());
        }
        else if (op === 'decrypt') {
          var decipher = nodeCrypto.createDecipheriv('aes-256-cbc', key, iv);
          decipher.update(data);
          resolve(decipher.final());
        }
      }
    });
  };
}

var aesCbcEncrypt = getAes("encrypt");
var aesCbcDecrypt = getAes("decrypt");

function hmacSha256Sign(key, msg) {
  return new Promise(function(resolve) {
    var hmac = nodeCrypto.createHmac('sha256', Buffer.from(key));
    hmac.update(msg);
    var result = hmac.digest();
    resolve(result);
  });
}

function hmacSha256Verify(key, msg, sig) {
  return new Promise(function(resolve) {
    var hmac = nodeCrypto.createHmac('sha256', Buffer.from(key));
    hmac.update(msg);
    var expectedSig = hmac.digest();
    resolve(equalConstTime(expectedSig, sig));
  });
}

function getPublic(privateKey) {
  // This function has sync API so we throw an error immediately.
  assert(privateKey.length === 32, "Bad private key");
  assert(isValidPrivateKey(privateKey), "Bad private key");
  // XXX(Kagami): `elliptic.utils.encode` returns array for every
  // encoding except `hex`.
  return Buffer.from(ec.keyFromPrivate(privateKey).getPublic("arr"));
}
function derive(privateKeyA, publicKeyB) {
  return new Promise(function(resolve) {
    assert(Buffer.isBuffer(privateKeyA), "Bad private key");
    assert(Buffer.isBuffer(publicKeyB), "Bad public key");
    assert(privateKeyA.length === 32, "Bad private key");
    assert(isValidPrivateKey(privateKeyA), "Bad private key");
    assert(publicKeyB.length === 65 || publicKeyB.length === 33, "Bad public key");
    if (publicKeyB.length === 65)
    {
      assert(publicKeyB[0] === 4, "Bad public key");
    }
    if (publicKeyB.length === 33)
    {
      assert(publicKeyB[0] === 2 || publicKeyB[0] === 3, "Bad public key");
    }
    var keyA = ec.keyFromPrivate(privateKeyA);
    var keyB = ec.keyFromPublic(publicKeyB);
    var Px = keyA.derive(keyB.getPublic());  // BN instance
    resolve(Buffer.from(Px.toArray()));
  });
}
function encrypt(publicKeyTo, msg, opts) {
  opts = opts || {};
  // Tmp variables to save context from flat promises;
  var iv, ephemPublicKey, ciphertext, macKey;
  return new Promise(function(resolve) {
    var ephemPrivateKey = opts.ephemPrivateKey || randomBytes(32);
    // There is a very unlikely possibility that it is not a valid key
    while(!isValidPrivateKey(ephemPrivateKey))
    {
      ephemPrivateKey = opts.ephemPrivateKey || randomBytes(32);
    }
    ephemPublicKey = getPublic(ephemPrivateKey);
    resolve(derive(ephemPrivateKey, publicKeyTo));
  }).then(function(Px) {
    return sha512(Px);
  }).then(function(hash) {
    iv = opts.iv || randomBytes(16);
    var encryptionKey = hash.slice(0, 32);
    macKey = hash.slice(32);
    return aesCbcEncrypt(iv, encryptionKey, msg);
  }).then(function(data) {
    ciphertext = data;
    var dataToMac = Buffer.concat([iv, ephemPublicKey, ciphertext]);
    return hmacSha256Sign(macKey, dataToMac);
  }).then(function(mac) {
    return {
      iv: iv,
      ephemPublicKey: ephemPublicKey,
      ciphertext: ciphertext,
      mac: mac,
    };
  });
}
function decrypt(privateKey, opts) {
  // Tmp variable to save context from flat promises;
  var encryptionKey;
  return derive(privateKey, opts.ephemPublicKey).then(function(Px) {
    return sha512(Px);
  }).then(function(hash) {
    encryptionKey = hash.slice(0, 32);
    var macKey = hash.slice(32);
    var dataToMac = Buffer.concat([
      opts.iv,
      opts.ephemPublicKey,
      opts.ciphertext
    ]);
    return hmacSha256Verify(macKey, dataToMac, opts.mac);
  }).then(function(macGood) {
    assert(macGood, "Bad MAC");
    return aesCbcDecrypt(opts.iv, encryptionKey, opts.ciphertext);
  }).then(function(msg) {
    return Buffer.from(new Uint8Array(msg));
  });
}

function _get_curve_from_account(account) {
  let curve = "secp256k1";
  if (account['type'] == 'SOL')
    curve = "ed25519";
  return curve 
}

function _encapsulate(opts) {
  return Buffer.concat([opts.ephemPublicKey, opts.iv, opts.mac, opts.ciphertext])
}

function _decapsulate(content) {
  return {
    ephemPublicKey: content.slice(0, 65),
    iv: content.slice(65, 65+16),
    mac: content.slice(65+16, 65+48),
    ciphertext: content.slice(65+48)
  }
}

function _encapsulate_box(opts) {
  return Buffer.concat([opts.nonce, opts.ciphertext])
}

function _decapsulate_box(content) {
  return {
    nonce: content.slice(0, nacl.secretbox.nonceLength),
    ciphertext: content.slice(nacl.secretbox.nonceLength)
  }
}

async function decrypt$1(account, content, { as_hex = true, as_string = true } = {}) {
  if (as_hex)
    content = Buffer.from(content, 'hex');
  else
    content = Buffer.from(content);
  
  const curve = _get_curve_from_account(account);

  let result = null;
  if (curve == 'secp256k1') {
    result = eciesjs.decrypt(eciesjs.utils.decodeHex(account['private_key']), content);
  } else if (curve == 'secp256r1') {
    let opts = _decapsulate(content);
    result = await decrypt(eciesjs.utils.decodeHex(account['private_key']), opts);
  } else if (curve == 'ed25519') {
    let opts = _decapsulate_box(content);
    result = nacl.secretbox.open(
      opts.ciphertext,
      opts.nonce,
      base58__default['default'].decode(account['private_key'])
    );
  }
  if (as_string)
    result = result.toString();
  return result
}
async function encrypt_for_self(
  account, content,
  { as_hex = true,
    as_string = true } = {}) {
  const curve = _get_curve_from_account(account);
  return await encrypt$1(
    account['public_key'], content,
    {'as_hex': as_hex, 'as_string': as_string, 'curve': curve})
}

async function encrypt$1(
  target_publickey, encrypted_content,
  { as_hex = true,
    as_string = true,
    curve = "secp256k1" } = {}) {
  
  if (as_string)
    encrypted_content = Buffer.from(encrypted_content);

  let result = null;
  if (curve == 'secp256k1')
    result = eciesjs.encrypt(target_publickey, encrypted_content);
  else if (curve == 'secp256r1') {
    result = await encrypt(eciesjs.utils.decodeHex(target_publickey), encrypted_content);
    result = _encapsulate(result);
  } else if (curve == 'ed25519') {
    let nonce = nacl.randomBytes(nacl.secretbox.nonceLength);
    let content = nacl.secretbox(encrypted_content, nonce, base58__default['default'].decode(key));
    result = _encapsulate_box({
      nonce: nonce,
      ciphertext: content
    });
  }

  if (as_hex)
    result = result.toString('hex');

  return result
}

var encryption = /*#__PURE__*/Object.freeze({
  __proto__: null,
  decrypt: decrypt$1,
  encrypt_for_self: encrypt_for_self,
  encrypt: encrypt$1
});

exports.aggregates = aggregates;
exports.avalanche = avalanche;
exports.broadcast = broadcast;
exports.cosmos = cosmos;
exports.encryption = encryption;
exports.ethereum = ethereum;
exports.ipfs_push = ipfs_push;
exports.ipfs_push_file = ipfs_push_file;
exports.messages = messages;
exports.nuls = nuls;
exports.nuls2 = nuls2;
exports.posts = posts;
exports.solana = solana;
exports.storage_push = storage_push;
exports.storage_push_file = storage_push_file;
exports.store = store;
exports.substrate = substrate;
