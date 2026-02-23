# Sistema de Cantina Automatizada

## Sobre o Projeto

O Sistema de Cantina Automatizada é uma aplicação desenvolvida para substituir completamente o uso de papéis na gestão de uma cantina, tornando os processos mais rápidos, organizados e rastreáveis.

O sistema foi construído utilizando:

- HTML
- CSS
- JavaScript
- Python
- Scripts .bat

Ele permite o gerenciamento completo de vendas, histórico de compras, entrada e saída de mercadorias, além da geração automatizada de planilhas para controle administrativo.

---

## Objetivo

O principal objetivo do projeto é:

- Digitalizar o controle da cantina
- Eliminar registros manuais em papel
- Reduzir erros humanos
- Automatizar relatórios e planilhas
- Melhorar a organização e rastreabilidade das operações
- Aumentar a velocidade no atendimento

---

## Estrutura do Sistema

O sistema é dividido em dois programas principais que se comunicam via rede local (LAN).

### 1. Console de Atendimento

O Console é utilizado pelo operador que realiza as vendas.

Funcionalidades:

- Registrar pedidos dos clientes
- Selecionar itens do cardápio
- Calcular automaticamente o valor total
- Gerar um ID único para cada compra
- Enviar os dados da compra via LAN para o Painel
- Registrar histórico de vendas

Ao finalizar o pedido, o Console envia:

- Nome do cliente
- Lista de itens
- Valor total
- ID da compra

---

### 2. Painel de Controle

O Painel é utilizado pela pessoa responsável pela entrega das mercadorias e gestão do estoque.

Funcionalidades:

- Receber pedidos enviados pelo Console
- Visualizar nome do cliente
- Visualizar itens comprados
- Visualizar valor total
- Visualizar ID da compra
- Confirmar entrega
- Controlar entrada e saída de mercadorias
- Atualizar estoque automaticamente
- Gerar planilhas automatizadas

O Painel funciona como centro administrativo da cantina.

---

## Funcionalidades Principais

### Gestão de Vendas

- Registro completo de cada compra
- Histórico armazenado
- Identificação única por ID
- Comunicação em tempo real via LAN

### Controle de Estoque

- Registro de entrada de mercadorias
- Registro de saída automática após venda
- Atualização automática de quantidades
- Histórico de movimentações

### Geração de Planilhas

- Relatórios automáticos
- Exportação de dados
- Organização por data
- Controle financeiro simplificado

---

## Tecnologias Utilizadas

### Frontend

- HTML para estrutura das interfaces
- CSS para estilização
- JavaScript para lógica e interatividade

### Backend

- Python para:
  - Comunicação via LAN
  - Processamento de dados
  - Controle de estoque
  - Geração de planilhas

### Automação

- Scripts .bat para facilitar inicialização dos programas

---

## Comunicação via Rede

O sistema utiliza comunicação em rede local (LAN) para envio e recebimento de dados entre:

- Console de Atendimento
- Painel de Controle

Isso permite:

- Atualização em tempo real
- Sincronização de pedidos
- Redução de retrabalho
- Maior agilidade operacional

---

## Benefícios do Sistema

- Substituição total de papéis
- Maior organização
- Histórico completo de operações
- Redução de erros
- Controle financeiro mais preciso
- Atendimento mais rápido
- Gestão centralizada

---

## Estrutura Básica do Projeto
/console
  index.html
  style.css
  script.js

/painel
  index.html
  style.css
  script.js

/backend
  servidor.py
  controle_estoque.py
  gerador_planilhas.py

/start_console.bat
/start_painel.bat

## Como Executar

1. Inicie o servidor Python.
2. Execute o script `.bat` correspondente ao programa desejado.
3. Abra o Console no computador de atendimento.
4. Abra o Painel no computador administrativo.
5. Certifique-se de que ambos estejam na mesma rede local.

---

## Possíveis Melhorias Futuras

- Sistema de login com diferentes níveis de acesso
- Dashboard com gráficos de vendas
- Banco de dados dedicado
- Backup automático
- Versão web hospedada em servidor externo
- Integração com sistemas de pagamento

---

## Licença

Este projeto é de uso livre para fins educacionais e administrativos.

---

## Autor

Desenvolvido para automatização e modernização da gestão de cantinas.
