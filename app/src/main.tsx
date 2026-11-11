import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { ProvedorDoMotor } from "./estado";
import { iniciarTema } from "./ajustes";
import "./index.css";

iniciarTema();

createRoot(document.getElementById("raiz")!).render(<StrictMode><ProvedorDoMotor><App /></ProvedorDoMotor></StrictMode>);
