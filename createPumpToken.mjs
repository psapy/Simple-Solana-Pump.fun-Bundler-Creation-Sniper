import { PublicKey, Keypair, Connection, VersionedTransaction,
TransactionMessage, TransactionInstruction, LAMPORTS_PER_SOL, SystemProgram } from '@solana/web3.js';
import * as spl from "@solana/spl-token"
import BN from "bn.js"
import { Bundle } from 'jito-ts/dist/sdk/block-engine/types.js';
import fs from 'fs'
import { searcherClient } from 'jito-ts/dist/sdk/block-engine/searcher.js'
const jitoAcc = new PublicKey("Cw8CFyM9FkoMi7K7Crf6HNQqf4uEMzpKw6QNghXLvLkY");
const accJito = new PublicKey("n3xTLeETwPaJXNvo2xMpM49iRcbwWxwqkWTGdmo5HcC");
const mpl = new PublicKey("metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s")

// will create a file named savedWallets in the same folder that holds your swap wallets keypairs. These persist until you physically delete them, then it will create new. It wont overwite the old ones ever.
// this bundler swaps in w/ 12 wallets in the same block as creation via jito bundles.

const connection = new Connection('Your Rpc Url') // your rpc, free works
const amountOfTokensToBuyPerWallet = 150000000000 // will buy 1500000 tokens per wallet for a 6 decimal token
const mainWallet = Keypair.fromSecretKey(Uint8Array.from([123, 123]))  // your main wallet
const obj = {name: "Shadowystupidcoder's Open Source Pump.fun Bundler", symbol: "SSCPFB", uri: "https://example.com/"} // token metadata



async function main() {
let bundle = []
console.log("main wallet:", mainWallet.publicKey.toString())
const rawWallets = await createOrLoadWallets()
const balArray = []
console.log("\nstarting bal check...")
for (const bytes of rawWallets) {
const wallet = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(bytes)))
balArray.push(wallet) }
const multi = await connection.getMultipleAccountsInfo(balArray.map(k => k.publicKey))
for (let e = 1; e < 13; e++) {
if (multi[e]) {
console.log(`wallet #${e}, ${balArray[e].publicKey} -> sol balance: ${multi[e].lamports}`) }
else { console.log(`wallet #${e} has no sol`) } }
console.log("\n", "if this fails, make sure the wallets are funded with enough sol and retry. \nyour wallets are permanent until you delete or rename the wallets file, then it will create new.")
console.log("\ncreating token with metadata:", obj)
const mint = Keypair.generate()
const mainKeys = await getPumpKeys(mainWallet.publicKey, mint.publicKey, mainWallet)
const ix = await createPumpToken(mainKeys, obj)
ix.push(SystemProgram.transfer({fromPubkey: mainWallet, toPubkey: jitoAcc, lamports: 1000000}))
ix.push(SystemProgram.transfer({fromPubkey: mainWallet, toPubkey: accJito, lamports: 1000000}))
const mainVtx = await createVtx([...ix], [mainWallet])
bundle.push(mainVtx)
console.log("pushed main token creation vTx to bundle...")
const walletsMap = {}
for (const wallet of balArray) {
const walletPumpKeys = await getPumpKeys(wallet.publicKey, mint.publicKey, wallet)
walletsMap[wallet.publicKey.toString()] === walletPumpKeys }
console.log("\ngathered all the keys...")
console.log("\nstarting to build the create and swap bundle...")
let temp = []
let signers = []
let count = 1
for (let e = 0; e < 13; e++) {
const swapIxs = await buyPumpToken(walletsMap[balArray[e].publicKey.toString()], amountOfTokensToBuyPerWallet)
temp.push(...swapIxs)
signers.push(balArray[e])
count += 1
if (count === 4) {
const swapVtx = await createVtx(temp, signers)
bundle.push(swapVtx)
temp = []
signers = []
count = 1
console.log("\npushed a batch of swaps to the bundle, new length:", bundle.length)
} }
console.log("\nbundle finished, sending it...")
const sent = await sendBundle(bundle)
console.log("bundle id:", sent)
}

await main()




export async function createPumpToken(pumpKeys, obj) {
let ixs = []
const objNameLength = formatLengthItem(obj.name)
const objSymbolLength = formatLengthItem(obj.symbol)
const objUriLength = formatLengthItem(obj.uri)
const disc = Buffer.from(Uint8Array.from([24, 30, 200, 40, 5, 28, 7, 119]))
const discHex = disc.toString("hex")
const nameBuffer = Buffer.from(obj.name, "utf-8")
const nameHex = nameBuffer.toString("hex")
const symbolBuffer = Buffer.from(obj.symbol, "utf-8")
const symbolHex = symbolBuffer.toString("hex")
const uriBuffer = Buffer.from(obj.uri, "utf-8")
const uriHex = uriBuffer.toString("hex")
const args = discHex + objNameLength + nameHex + objSymbolLength + symbolHex + objUriLength + uriHex
const createIxData = Buffer.from(args, "hex")
const accountMetas = [
{pubkey: new PublicKey(pumpKeys.mint), isSigner: true, isWritable: true},
{pubkey: new PublicKey(pumpKeys.mintAuthority), isSigner: false, isWritable: false},
{pubkey: new PublicKey(pumpKeys.bonding), isSigner: false, isWritable: true},
{pubkey: new PublicKey(pumpKeys.associatedBondingCurve), isSigner: false, isWritable: true},
{pubkey: new PublicKey(pumpKeys.global), isSigner: false, isWritable: false},
{pubkey: new PublicKey(pumpKeys.mplTokenMetadata), isSigner: false, isWritable: false},
{pubkey: new PublicKey(pumpKeys.metadata), isSigner: false, isWritable: true},
{pubkey: new PublicKey(pumpKeys.user), isSigner: true, isWritable: true},
{pubkey: new PublicKey(pumpKeys.systemProgram), isSigner: false, isWritable: false},
{pubkey: new PublicKey(pumpKeys.tokenProgram), isSigner: false, isWritable: false},
{pubkey: new PublicKey(pumpKeys.associatedTokenProgram), isSigner: false, isWritable: false},
{pubkey: new PublicKey(pumpKeys.rent), isSigner: false, isWritable: false},
{pubkey: new PublicKey(pumpKeys.eventAuthority), isSigner: false, isWritable: false},
{pubkey: new PublicKey(pumpKeys.program), isSigner: false, isWritable: false}]
const programId = new PublicKey(pumpKeys.program)
const instruction = new TransactionInstruction({keys: accountMetas, programId, data: createIxData})
ixs.push(instruction)
return(ixs) }

function formatLengthItem(str) {
const length = str.length
const paddedLength = length < 10 ? `0${length}` : `${length}`
return `${paddedLength}000000`.slice(0, 8) }

async function getOwnerAta(mint, publicKey) {
const foundAta = PublicKey.findProgramAddressSync([publicKey.toBuffer(), spl.TOKEN_PROGRAM_ID.toBuffer(), mint.toBuffer()], spl.ASSOCIATED_TOKEN_PROGRAM_ID)[0];
return(foundAta) }

export async function getPumpKeys(user, mint, walletKeypair) {
const metadata = PublicKey.findProgramAddressSync( [ Buffer.from('metadata'), mpl.toBuffer(), mint.toBuffer() ], mpl)[0]
const program = new PublicKey("6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P")
const mplTokenMetadata = new PublicKey("metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s")
const tokenProgram = spl.TOKEN_PROGRAM_ID
const ataProgram = spl.ASSOCIATED_TOKEN_PROGRAM_ID
const systemProgram = PublicKey.default
const mintAuthority = new PublicKey("TSLvdd1pWpHVjahSpsvCXUbgwsL3JAcvokwaKt1eokM")
const eventAuthority = new PublicKey("Ce6TQqeHC9p8KetsN6JsjHK7UTZk7nasjjnr7XxXp9F1")
const feeRecipient = new PublicKey("68yFSZxzLWJXkxxRGydZ63C6mHx1NLEDWmwN9Lb5yySg")
const rent = new PublicKey("SysvarRent111111111111111111111111111111111")
const userAssociatedToken = await getOwnerAta(mint, user)
const seeds = [ Buffer.from('global', 'utf-8'), Buffer.from('bonding-curve', 'utf-8'), Buffer.from('metadata', 'utf-8')]
const global = PublicKey.findProgramAddressSync([seeds[0]], program)[0]
const bonding = PublicKey.findProgramAddressSync([seeds[1], mint.toBuffer()], program)[0];
const associatedBondingCurve = await spl.getAssociatedTokenAddress(mint, bonding, {allowOwnerOffCurve: true})
const pumpKeys = {
walletKeypair: walletKeypair,
mint: mint,
mintAuthority: mintAuthority,
bonding: bonding,
associatedBondingCurve: associatedBondingCurve,
global: global,
mplTokenMetadata: mplTokenMetadata,
metadata: metadata,
user: user,
systemProgram: systemProgram,
tokenProgram: tokenProgram,
associatedTokenProgram: ataProgram,
rent: rent,
eventAuthority: eventAuthority,
program: program,
sellEventAuthority: new PublicKey("Ce6TQqeHC9p8KetsN6JsjHK7UTZk7nasjjnr7XxXp9F1"),
feeRecipient: new PublicKey("CebN5WGQ4jvEPvsVU4EoHEpgzq1VV7AbicfhtW4xC9iM"),
userAssociatedToken: userAssociatedToken}
return(pumpKeys)}



async function buyPumpToken(pumpKeys, buyTokensAmountRaw) {
const ixs = []
const maxSolCost = 1
const maxSolCostRaw = maxSolCost * LAMPORTS_PER_SOL
const createAta = spl.createAssociatedTokenAccountIdempotentInstruction(pumpKeys.walletKeypair.publicKey, pumpKeys.userAssociatedToken, pumpKeys.walletKeypair.publicKey, pumpKeys.mint)
const buffer = Buffer.alloc(24)
const obj = {amount:new BN(buyTokensAmountRaw), maxSolCost:new BN(maxSolCostRaw)}
obj.amount.toArrayLike(Buffer, 'le', 8).copy(buffer, 8)
obj.maxSolCost.toArrayLike(Buffer, 'le', 8).copy(buffer, 16)
Buffer.from("66063d1201daebea", "hex").copy(buffer, 0)
const accountMetas = [
{pubkey: new PublicKey(pumpKeys.global), isSigner: false, isWritable: false},
{pubkey: new PublicKey(pumpKeys.feeRecipient), isSigner: false, isWritable: true},
{pubkey: new PublicKey(pumpKeys.mint), isSigner: false, isWritable: false},
{pubkey: new PublicKey(pumpKeys.bonding), isSigner: false, isWritable: true},
{pubkey: new PublicKey(pumpKeys.associatedBondingCurve), isSigner: false, isWritable: true},
{pubkey: new PublicKey(pumpKeys.userAssociatedToken), isSigner: false, isWritable: true},
{pubkey: pumpKeys.walletKeypair.publicKey, isSigner: true, isWritable: true},
{pubkey: new PublicKey(pumpKeys.systemProgram), isSigner: false, isWritable: false},
{pubkey: new PublicKey(pumpKeys.tokenProgram), isSigner: false, isWritable: false},
{pubkey: new PublicKey(pumpKeys.rent), isSigner: false, isWritable: false},
{pubkey: new PublicKey(pumpKeys.sellEventAuthority), isSigner: false, isWritable: false},
{pubkey: new PublicKey(pumpKeys.program), isSigner: false, isWritable: false}]
const programId = new PublicKey(pumpKeys.program)
const instruction = new TransactionInstruction({keys: accountMetas, programId, data: buffer})
ixs.push(createAta)
ixs.push(instruction)
return(ixs) }


export async function createVtx(ixBatch, signers) {
const payee = signers[0].publicKey
const bh = (await connection.getLatestBlockhash("processed")).blockhash
const message = new TransactionMessage({payerKey: payee, instructions: ixBatch, recentBlockhash: bh }).compileToV0Message([])
const txn = new VersionedTransaction(message)
txn.sign(...signers)
console.log("\npaying for this versioned transaction with the first wallet in the signers array:", signers[0].publicKey.toString())
return txn }



async function sendBundle(txArr) {
const BLOCK_ENGINE_URLS = 'ny.mainnet.block-engine.jito.wtf'
const auth = Keypair.fromSecretKey(Uint8Array.from([ 170, 102, 199, 216, 226, 201, 23, 43, 26, 120, 207, 73, 110, 164, 116, 178, 255, 140, 255, 218, 189, 56, 60, 156, 217, 54, 187, 126, 163, 9, 162, 105, 7, 82, 19, 78, 31, 45, 211, 21, 169, 244, 1, 88, 110, 145, 211, 13, 133, 99, 16, 32, 105, 253, 55, 213, 94, 124, 237, 195, 235, 255, 7, 72 ]))
  let bundle = txArr
  if (Array.isArray(txArr)) { bundle = new Bundle(txArr, 5) }
  const client = searcherClient(BLOCK_ENGINE_URLS, auth);
  const bundleId = await client.sendBundle(bundle);
	client.onBundleResult( (bundleResult) => { if (bundleResult.id === bundleId) {
      console.log('Bundle result:', bundleResult) } (error) => {console.log(error) } } ) }

async function createOrLoadWallets() {
let rawWallets
let wallets = []
try {
rawWallets = fs.readFileSync("./savedWallets12.json", "utf-8")
wallets = JSON.parse(rawWallets)
for (const each in wallets) {
const wallet = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(wallets[each])))
wallets.push(`[${wallet.secretKey.toString()}]`)
return(wallets) } } catch {}
if (!rawWallets) {
for (let i = 1; i < 13; i++) {
const wallet = Keypair.generate()
wallets.push(`[${wallet.secretKey.toString()}]`) }
fs.writeFileSync("./savedWallets12.json", JSON.stringify(wallets)) }
return(wallets) }