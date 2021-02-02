import WIF from "wif";
import base58 from "bs58";
import Neon, {
  api,
  CONST,
  nep5,
  rpc,
  sc,
  tx,
  u,
  wallet,
} from "@cityofzion/neon-js";
import { sign } from "crypto";
import { Transaction } from "ethereumjs-tx";

const tokens = {
  SOUL: "ed07cffad18f1308db51920d99a2af60ac66a7b3",
  NEO: "0xc56f33fc6ecfcd0c225c4ab356fee59390af8560be0e930faebe74a6daff7c9b",
  GAS: "0x602c79718b16e442de58778e148d0b1084e3b2dffd5de6b7b16cee7969282de7",
};

function ab2hexstring(arr: ArrayBuffer | ArrayLike<number>): string {
  if (typeof arr !== "object") {
    throw new Error(`ab2hexstring expects an array.Input was ${arr}`);
  }
  let result = "";
  const intArray = new Uint8Array(arr);
  for (const i of intArray) {
    let str = i.toString(16);
    str = str.length === 0 ? "00" : str.length === 1 ? "0" + str : str;
    result += str;
  }
  return result;
}

export function getNeoAddressFromWif(wif: string): string {
  const pk = ab2hexstring(WIF.decode(wif, 128).privateKey);
  const sh = wallet.getScriptHashFromPublicKey(
    wallet.getPublicKeyFromPrivateKey(pk)
  );
  return wallet.getAddressFromScriptHash(sh);
}

export function getScriptHashFromAddress(address: string): string {
  return wallet.getScriptHashFromAddress(address);
}

export async function getNeoBalances(
  neoAddress: string,
  isMainnet: boolean
): Promise<any> {
  if (!isMainnet) console.log("%cNEO Testnet not supported", "font-size:20px");
  const account = await rpc.Query.getAccountState(neoAddress).execute(
    "http://seed.neoeconomy.io:10332"
  );

  console.log("neo account", account);

  const balances = [];
  const soulFixed = await nep5.getTokenBalance(
    "http://seed.neoeconomy.io:10332",
    tokens.SOUL,
    neoAddress
  );
  console.log("soulfixed", soulFixed);
  const soulAmount = soulFixed.toString();
  console.log("soulamount", soulAmount);
  if (soulAmount !== "0") balances.push({ symbol: "SOUL", amount: soulAmount });

  if (account.result && account.result.balances) {
    const bals = account.result.balances;
    bals.forEach((el: any) => {
      if (el.asset == tokens.NEO && el.value !== 0)
        balances.push({ symbol: "NEO", amount: el.value });
      if (el.asset == tokens.GAS && el.value !== 0)
        balances.push({ symbol: "GAS", amount: el.value });
    });
  }

  return balances;
}

async function sendNep5(
  wif: string,
  amount: number,
  symbol: string,
  dest: string,
  desc: string,
  gasFee: number
) {
  const contractScriptHash = "ed07cffad18f1308db51920d99a2af60ac66a7b3";
  const myAccount = new wallet.Account(wif);

  // We must change the data type of contract parameters
  const param_sending_address = sc.ContractParam.byteArray(
    myAccount.address,
    "address"
  );
  const param_receiving_address = sc.ContractParam.byteArray(dest, "address");
  const param_amount = Neon.create.contractParam("Integer", 1 * 1e8);

  // Build contract script
  const props = {
    scriptHash: contractScriptHash,
    operation: "transfer",
    args: [param_sending_address, param_receiving_address, param_amount],
  };

  const script = Neon.create.script(props);

  // Create transaction object
  let rawTransaction = new tx.InvocationTransaction({
    script: script,
    gas: 0,
  });

  // Build input objects and output objects.
  rawTransaction.addAttribute(
    tx.TxAttrUsage.Script,
    u.reverseHex(wallet.getScriptHashFromAddress(myAccount.address))
  );

  rawTransaction.addAttribute(
    tx.TxAttrUsage.Description,
    u.str2hexstring(desc)
  );

  // rawTransaction.gas = new u.Fixed8(0.1);

  // Sign transaction with sender's private key
  const signature = wallet.sign(
    rawTransaction.serialize(false),
    myAccount.privateKey
  );

  // Add witness
  rawTransaction.addWitness(
    tx.Witness.fromSignature(signature, myAccount.publicKey)
  );

  // Send raw transaction
  const client = new rpc.RPCClient("http://seed.neoeconomy.io:10332");
  const res = await client.sendRawTransaction(rawTransaction);
  console.log("sendNep5 Raw Tx", res, rawTransaction);
  return rawTransaction.hash;
}

async function sendNative(
  wif: string,
  amount: number,
  symbol: string,
  dest: string,
  desc: string,
  gasFee: number
) {
  const myAccount = new wallet.Account(wif);

  const apiProvider = new api.neoscan.instance(
    "https://api.neoscan.io/api/main_net"
  );

  // Create contract transaction using Neoscan API
  async function createTxWithNeoScan() {
    let balance = await apiProvider.getBalance(myAccount.address);
    let transaction = Neon.create.contractTx();
    transaction
      .addIntent(symbol, amount, dest)
      .addAttribute(tx.TxAttrUsage.Description, u.str2hexstring(desc))
      .calculate(balance)
      .sign(myAccount.privateKey);

    return transaction;
  }

  // Send raw transaction
  const client = new rpc.RPCClient("http://seed.neoeconomy.io:10332");

  const transaction = await createTxWithNeoScan();
  console.log(transaction);
  const res = await client.sendRawTransaction(transaction);
  console.log("sendNative Raw Tx", res, transaction);

  return transaction.hash;
}

export async function sendNeo(
  wif: string,
  amount: number,
  symbol: string,
  dest: string,
  desc: string,
  gasFee: number
) {
  let hash = "";
  if (symbol == "SOUL") {
    hash = await sendNep5(wif, amount, symbol, dest, desc, gasFee);
  } else {
    hash = await sendNative(wif, amount, symbol, dest, desc, gasFee);
  }
  return hash;
}
