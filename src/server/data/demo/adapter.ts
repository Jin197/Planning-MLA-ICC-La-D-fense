import "server-only";
import type { DataAdapter, RpcMap, RpcName, Tx } from "../port";
import { readStore, writeStore } from "./store";
import { runDemoRpc } from "./rpc";

export const demoAdapter: DataAdapter = {
  kind: "demo",
  read<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
    return readStore(fn);
  },
  transaction<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
    return writeStore(fn);
  },
  rpc<N extends RpcName>(
    name: N,
    args: RpcMap[N]["args"],
  ): Promise<RpcMap[N]["result"]> {
    return writeStore((tx) => runDemoRpc(tx, name, args));
  },
};
