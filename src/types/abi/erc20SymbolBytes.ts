import * as ethers from "ethers";

export const abi = new ethers.utils.Interface(getJsonAbi());

export interface EvmEvent {
  data: string;
  topics: string[];
}

export const events = {
}

function getJsonAbi(): any {
  return [
    {
      "constant": true,
      "inputs": [],
      "name": "symbol",
      "outputs": [
        {
          "internalType": "bytes32",
          "name": "",
          "type": "bytes32"
        }
      ],
      "payable": false,
      "stateMutability": "view",
      "type": "function"
    }
  ]
}
