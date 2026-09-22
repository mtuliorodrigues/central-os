import json, os, time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
EVENTS=os.environ.get('FAKE_EVENTS','/tmp/fake-evolution-events.jsonl')
COMMAND_MODE=os.environ.get('FAKE_LISTENER_COMMAND')=='1'
RECENT_CALLS=0
ORIGIN='111111111111@g.us'
ROOT='*Cliente:* Maria Sintetica\n*OS:* 9001\n*ID:* 12345\n*Login:* maria\n*Serviço:* Internet Fibra\n*Descrição:* Sem conexão teste sintético'
def records():
    ts=int(time.time())
    return [
      {'key':{'id':'MSG1','remoteJid':ORIGIN,'fromMe':False},'pushName':'Operador','messageTimestamp':ts,'message':{'conversation':ROOT}},
      {'key':{'id':'MSG2','remoteJid':ORIGIN,'fromMe':False},'pushName':'Tecnico','messageTimestamp':ts+10,'message':{'extendedTextMessage':{'text':'Bom dia, foi feita','contextInfo':{'stanzaId':'MSG1','quotedMessage':{'conversation':ROOT}}}}}
    ]
class H(BaseHTTPRequestHandler):
    def log_message(self,*a): pass
    def sendj(self,code,obj):
        b=json.dumps(obj,ensure_ascii=False).encode(); self.send_response(code); self.send_header('Content-Type','application/json'); self.send_header('Content-Length',str(len(b))); self.end_headers(); self.wfile.write(b)
    def do_GET(self):
        if self.path.startswith('/instance/connectionState/'):
            return self.sendj(200,{'instance':{'state':'open'}})
        return self.sendj(200,{'status':'ok','fake':True})
    def do_POST(self):
        n=int(self.headers.get('Content-Length','0')); raw=self.rfile.read(n) if n else b''
        try: body=json.loads(raw or b'{}')
        except: body={}
        with open(EVENTS,'a',encoding='utf-8') as f: f.write(json.dumps({'path':self.path,'body':body},ensure_ascii=False)+'\n')
        if self.path.startswith('/chat/findMessages/'):
            global RECENT_CALLS
            if COMMAND_MODE and not (isinstance(body,dict) and body.get('where')):
                RECENT_CALLS += 1
                if RECENT_CALLS == 1:
                    return self.sendj(200,{'messages':{'records':[],'pages':1}})
                cmd={'key':{'id':'CMD1','remoteJid':'5534999999999@s.whatsapp.net','fromMe':False},'pushName':'Usuario Teste','messageTimestamp':int(time.time()),'message':{'conversation':'!relatorio'}}
                return self.sendj(200,{'messages':{'records':[cmd],'pages':1}})
            return self.sendj(200,{'messages':{'records':records(),'pages':1}})
        if self.path.startswith('/chat/syncHistory/'):
            return self.sendj(200,{'ok':True})
        if self.path.startswith('/message/forwardMessage/'):
            if not body: return self.sendj(400,{'error':'payload required'})
            return self.sendj(200,{'ok':True,'forwarded':True})
        if self.path.startswith('/message/sendText/'):
            return self.sendj(200,{'ok':True})
        return self.sendj(404,{'error':'not found'})
if __name__=='__main__':
    port=int(os.environ.get('FAKE_EVOLUTION_PORT','18080')); ThreadingHTTPServer(('127.0.0.1',port),H).serve_forever()
