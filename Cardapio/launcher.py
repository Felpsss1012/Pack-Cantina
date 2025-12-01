# launcher.py
import subprocess
import time
import webbrowser
import socket
import sys
import os
import threading
from urllib.request import urlopen, URLError

# ---------------- CONFIG ----------------
PYTHON_EXE = sys.executable  # usa o python do ambiente atual (venv ativado caso use .bat antes)
APP_SCRIPT = "app.py"
SERVER_HOST = "0.0.0.0"      # endereço que o Flask vai bindar (geralmente 0.0.0.0 ou 127.0.0.1)
SERVER_PORT = 5000

# Host que vamos usar para acessar o servidor via browser/HTTP.
# Se você estiver na máquina servidor, use "127.0.0.1".
# Se quiser acessar de outra máquina na LAN, coloque o IP da interface (ex: "192.168.10.1").
OPEN_HOST = "127.0.0.1"

# caminhos a testar (ordem): tenta vários endpoints para evitar 404 por rota diferente
OPEN_PATHS = ["/", "/index", "/index.html", "/html/index.html", "/painel"]

# timeout gerais (segundos)
WAIT_PORT_TIMEOUT = 25
HTTP_READY_TIMEOUT = 12

# ----------------------------------------

def wait_for_port(host, port, timeout=30, interval=0.5):
    """Aguarda a porta TCP estar aceitando conexões (retorna True quando aceitar)."""
    deadline = time.time() + timeout
    while time.time() < deadline:
        try:
            with socket.create_connection((host, port), timeout=1):
                return True
        except Exception:
            time.sleep(interval)
    return False

def http_ready(url, timeout=10):
    """Checa se a URL responde com sucesso (qualquer código 2xx/3xx/4xx/5xx - aqui buscamos conexão)."""
    deadline = time.time() + timeout
    while time.time() < deadline:
        try:
            resp = urlopen(url, timeout=2)
            # se chegou até aqui, servidor HTTP respondeu (status disponível via resp.getcode())
            return True
        except URLError:
            time.sleep(0.5)
        except Exception:
            time.sleep(0.5)
    return False

def stream_process_output(proc):
    """Thread que imprime stdout/stderr do processo em tempo real."""
    try:
        for line in proc.stdout:
            if not line:
                break
            print(line.rstrip())
    except Exception:
        pass

def is_port_in_use(host, port):
    try:
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
            s.settimeout(0.6)
            res = s.connect_ex((host, port))
            return res == 0
    except Exception:
        return False

def main():
    cwd = os.path.dirname(os.path.abspath(__file__))

    # monta urls a tentar abrir
    urls = [f"http://{OPEN_HOST}:{SERVER_PORT}{p}" for p in OPEN_PATHS]

    print("Launcher: iniciando servidor:", APP_SCRIPT)
    # inicia o processo (mesmo ambiente python)
    proc = subprocess.Popen(
        [PYTHON_EXE, APP_SCRIPT],
        cwd=cwd,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
        bufsize=1
    )

    # roda thread que streama logs
    t = threading.Thread(target=stream_process_output, args=(proc,), daemon=True)
    t.start()

    # se porta já em uso, avisa (não interrompe; talvez já exista outro processo)
    if is_port_in_use("0.0.0.0", SERVER_PORT) or is_port_in_use("127.0.0.1", SERVER_PORT):
        print(f"[WARN] Porta {SERVER_PORT} já está em uso. Se não for você, verifique processos rodando.")
        # mesmo assim tenta abrir urls — pode ser que outro processo seja o Flask esperado.

    print(f"Aguardando servidor responder na porta {SERVER_PORT} ... (timeout {WAIT_PORT_TIMEOUT}s)")
    # tenta conectar em OPEN_HOST (onde abriremos browser)
    port_ready = wait_for_port(OPEN_HOST, SERVER_PORT, timeout=WAIT_PORT_TIMEOUT)
    if not port_ready:
        # fallback: tenta escutar em localhost também (caso OPEN_HOST seja interface LAN)
        print(f"Não detectei servidor em {OPEN_HOST}:{SERVER_PORT} dentro do tempo. Tentando localhost...")
        port_ready = wait_for_port("127.0.0.1", SERVER_PORT, timeout=5)

    if not port_ready:
        print(f"[ERRO] Tempo esgotado aguardando porta {SERVER_PORT}. Vou imprimir alguns logs e sair.")
        try:
            # tenta ler algum conteúdo acumulado do stdout para diagnóstico
            time.sleep(0.5)
            remaining = proc.stdout.read()
            if remaining:
                print("---- saída parcial do processo ----")
                print(remaining)
        except Exception:
            pass
        # não finaliza o processo automaticamente (usuário pode inspecionar), mas informa
        print("Servidor pode não ter iniciado corretamente. Verifique o log acima.")
    else:
        # porta aceita conexões — agora testar as rotas HTTP
        opened = False
        for url in urls:
            print("Testando:", url)
            if http_ready(url, timeout=HTTP_READY_TIMEOUT):
                try:
                    webbrowser.open_new_tab(url)
                    print("Navegador aberto em:", url)
                except Exception:
                    print("Falha ao abrir navegador automaticamente. Abra manualmente:", url)
                opened = True
                break
            else:
                print("Rota não respondeu rapidamente:", url)
        if not opened:
            # se nenhuma rota respondeu, abre a primeira como fallback para o usuário ver o que acontece
            fallback = urls[0]
            print("Nenhuma rota respondeu rapidamente. Abrindo fallback:", fallback)
            try:
                webbrowser.open_new_tab(fallback)
            except Exception:
                print("Falha ao abrir navegador automaticamente. Abra manualmente:", fallback)

    # mantém o launcher ativo enquanto o servidor rodar; encerra servidor ao CTRL+C
    try:
        while True:
            # se o processo terminou, sai
            if proc.poll() is not None:
                print("Processo servidor finalizou. Código de saída:", proc.returncode)
                break
            time.sleep(0.5)
    except KeyboardInterrupt:
        print("CTRL+C recebido — encerrando servidor...")
        try:
            proc.terminate()
            # espera um pouco e força kill se necessário
            try:
                proc.wait(timeout=5)
            except Exception:
                proc.kill()
        except Exception as e:
            print("Erro ao encerrar processo:", e)

if __name__ == "__main__":
    main()
