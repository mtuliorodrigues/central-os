import { Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { Card } from "../components/ui/Card";

export function NotFoundPage() {
  return <div className="page-stack"><Card className="not-found-card"><strong>404</strong><h1>Página não encontrada</h1><p>O endereço informado não corresponde a uma tela da Central OS.</p><Link to="/"><ArrowLeft className="h-4 w-4" /> Voltar ao Início</Link></Card></div>;
}
