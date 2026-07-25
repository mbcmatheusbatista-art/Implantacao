import { useCallback, useEffect, useMemo, useState } from "react";
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

const MESSAGE_DEBUG = true;

function debugMessage(label: string, data: unknown) {
  if (!MESSAGE_DEBUG) return;
  console.log(`[MESSAGE DEBUG] ${label}`, JSON.stringify(data, null, 2));
}

/**
 * Try every possible interpretation of the phone string to build a WhatsApp URL.
 * If the high-level function fails, we brute-force it by extracting ALL digits and
 * trying every prefix as DDD.
 */
function tryBuildWhatsAppUrl(phone: string, message: string): string | null {
  // 1. Use the standard function first
  const standard = buildWhatsAppUrl(phone, message);
  if (standard) return standard;

  // 2. Brute-force: extract all digits and try every 2-digit prefix as DDD
  const allDigits = phone.replace(/\D/g, "");
  debugMessage("tryBuild:fallback-extreme", { allDigits, length: allDigits.length });

  const VALID_DDD = new Set([
    11, 12, 13, 14, 15, 16, 17, 18, 19, 21, 22, 24, 27, 28, 31, 32, 33, 34, 35, 37, 38, 41, 42, 43,
    44, 45, 46, 47, 48, 49, 51, 53, 54, 55, 61, 62, 63, 64, 65, 66, 67, 68, 69, 71, 73, 74, 75, 77,
    79, 81, 82, 83, 84, 85, 86, 87, 88, 89, 91, 92, 93, 94, 95, 96, 97, 98, 99,
  ]);

  // Try stripping country code 55 if present
  let digits = allDigits;
  if (digits.startsWith("55") && digits.length > 11) {
    digits = digits.slice(2);
  }

  // If we have at least 8 digits, try the first 2 as DDD
  if (digits.length >= 8) {
    const ddd = parseInt(digits.slice(0, 2), 10);
    if (VALID_DDD.has(ddd)) {
      const url = `whatsapp://send?phone=55${digits}&text=${encodeURIComponent(message)}`;
      debugMessage("tryBuild:success-brute-force", { original: phone, digits, ddd, url });
      return url;
    }
  }

  // Try with full digits including 55
  if (allDigits.length >= 10) {
    const ddd = parseInt(allDigits.slice(2, 4), 10);
    if (VALID_DDD.has(ddd)) {
      const url = `whatsapp://send?phone=${allDigits}&text=${encodeURIComponent(message)}`;
      debugMessage("tryBuild:success-full-digits", { original: phone, allDigits, ddd, url });
      return url;
    }
  }

  // Last ditch: any 8+ digit string, just try it with WhatsApp
  if (allDigits.length >= 8) {
    const url = `whatsapp://send?phone=55${allDigits.slice(0, 10).padEnd(10, "0")}&text=${encodeURIComponent(message)}`;
    debugMessage("tryBuild:last-ditch", { original: phone, allDigits, url });
    return url;
  }

  return null;
}

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
      debugMessage("dialog:open", {
        phone,
        messagePreview: message.slice(0, 100),
        title,
      });
      setText(message);
      const newPhone = phone ?? "";
      setManualPhone(newPhone);
      const testUrl = newPhone ? tryBuildWhatsAppUrl(newPhone, message) : null;
      debugMessage("dialog:initial-url-test", {
        phone: newPhone,
        hasUrl: testUrl !== null,
        url: testUrl,
      });
    }
  }, [open, message, phone, title]);

  const url = useMemo(() => {
    if (!manualPhone) return null;
    return tryBuildWhatsAppUrl(manualPhone, text);
  }, [manualPhone, text]);

  const handleManualPhoneChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const v = e.target.value;
    debugMessage("dialog:manual-phone-change", {
      value: v,
      valueLength: v.length,
    });
    setManualPhone(v);
  }, []);

  async function handleCopy() {
    const ok = await copyToClipboard(text);
    if (ok) toast.success("Mensagem copiada para a área de transferência.");
    else toast.error("Não foi possível copiar.");
  }

  function handleOpen() {
    if (!url) {
      debugMessage("dialog:open-failed-no-url", { manualPhone, textPreview: text.slice(0, 100) });
      toast.error("Telefone inválido — não é possível abrir o WhatsApp. Verifique se o número tem DDD (ex: 51 99728-8666).");
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
            <Input value={manualPhone} onChange={handleManualPhoneChange} />
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
