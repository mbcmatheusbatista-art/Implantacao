import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Copy, MessageCircle, ExternalLink } from "lucide-react";
import { buildWhatsAppUrl, copyToClipboard, openWhatsAppInReusableTab } from "@/utils/whatsapp-url";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  message: string;
  phone: string | null;
  title?: string;
  extraInfo?: React.ReactNode;
}

export function MessageDialog({ open, onOpenChange, message, phone, title, extraInfo }: Props) {
  const [text, setText] = useState(message);
  const [manualPhone, setManualPhone] = useState(phone ?? "");

  useEffect(() => {
    if (open) {
      setText(message);
      setManualPhone(phone ?? "");
    }
  }, [open, message, phone]);

  const url = manualPhone ? buildWhatsAppUrl(manualPhone, text) : null;

  async function handleCopy() {
    const ok = await copyToClipboard(text);
    if (ok) toast.success("Mensagem copiada para a área de transferência.");
    else toast.error("Não foi possível copiar.");
  }

  function handleOpen() {
    if (!url) {
      toast.error("Telefone inválido — não é possível abrir o WhatsApp.");
      return;
    }
    const w = openWhatsAppInReusableTab(url);
    if (!w) {
      toast.error(
        "Não foi possível acionar o app do WhatsApp. Verifique se ele está instalado ou utilize o botão Copiar mensagem.",
      );
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{title ?? "Mensagem"}</DialogTitle>
          <DialogDescription>
            Revise a mensagem antes de copiar ou abrir o WhatsApp.
          </DialogDescription>
        </DialogHeader>
        {extraInfo}
        <div className="space-y-3">
          <div>
            <Label>Telefone (com DDD)</Label>
            <Input value={manualPhone} onChange={(e) => setManualPhone(e.target.value)} />
          </div>
          <div>
            <Label>Mensagem</Label>
            <Textarea value={text} onChange={(e) => setText(e.target.value)} className="min-h-64" />
          </div>
        </div>
        <DialogFooter className="flex-wrap gap-2">
          <Button variant="outline" onClick={handleCopy}>
            <Copy className="w-4 h-4 mr-2" /> Copiar mensagem
          </Button>
          {url ? (
            <Button
              onClick={() => {
                handleOpen();
                onOpenChange(false);
              }}
            >
              <MessageCircle className="w-4 h-4 mr-2" /> Abrir WhatsApp
              <ExternalLink className="w-3 h-3 ml-2" />
            </Button>
          ) : (
            <Button disabled onClick={handleOpen}>
              <MessageCircle className="w-4 h-4 mr-2" /> WhatsApp indisponível
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
