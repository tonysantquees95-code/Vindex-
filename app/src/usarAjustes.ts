import { useSyncExternalStore } from "react";
import { ajustesAtuais, assinar, definirAjustes, type Ajustes } from "./ajustes";

export function useAjustes(): [Ajustes, typeof definirAjustes] {
  return [useSyncExternalStore(assinar, ajustesAtuais), definirAjustes];
}
