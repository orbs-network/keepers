declare module 'orbs-signer-client' {
  import { SignedTransaction } from 'web3-core';
  import { TxData } from "@ethereumjs/tx";

  export default class Signer {
    public constructor(host: string);
    sign(transaction: TxData, chainId?: Number, expectedSenderAddress?: String): Promise<SignedTransaction>;
  }
}
