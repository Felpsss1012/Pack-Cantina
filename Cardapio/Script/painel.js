// painel.js (versão com suporte a observações)
document.addEventListener('DOMContentLoaded', () => {
  const SERVER_URL = "http://192.168.6.5:5000"; // ajuste se necessário

  // DOM (garantido que existe)
  const listaEl = document.getElementById('lista');
  const historicoEl = document.getElementById('historicoList');
  const emptyEl = document.getElementById('empty');
  const emptyHist = document.getElementById('emptyHistory');
  const serverStatus = document.getElementById('serverStatus');
  const refreshBtn = document.getElementById('refreshBtn');
  const filterInput = document.getElementById('filterInput');
  const clearFilterBtn = document.getElementById('clearFilterBtn');
  const exportCsvBtn = document.getElementById('exportCsvBtn');

  const tabAtivos = document.getElementById('tab-ativos');
  const tabHistorico = document.getElementById('tab-historico');

  const detailModal = document.getElementById('detailModal');
  const detailClose = document.getElementById('detailClose');
  const detailContent = document.getElementById('detailContent');
  const detailTitle = document.getElementById('detailTitle');

  const toastEl = document.getElementById('toast');

  let pedidos = {}; // id -> pedido

  // mantém lista de pedidos removidos localmente (persistente entre reloads)
  const REMOVED_KEY = 'painel_removed_orders_v1';
  let removedSet = new Set(JSON.parse(localStorage.getItem(REMOVED_KEY) || '[]'));

  function markRemovedLocally(id) {
    removedSet.add(String(id));
    localStorage.setItem(REMOVED_KEY, JSON.stringify(Array.from(removedSet)));
  }
  function isLocallyRemoved(id) {
    return removedSet.has(String(id));
  }


  function showToast(msg, ms = 2200) {
    if (!toastEl) return console.log('TOAST:', msg);
    toastEl.textContent = msg;
    toastEl.style.display = 'block';
    setTimeout(() => toastEl.style.display = 'none', ms);
  }

  function escapeHtml(s) {
    if (!s && s !== 0) return '';
    return String(s).replace(/[&<>"']/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
  }

  function parseItens(itemsRaw) {
    if (!itemsRaw) return [];
    if (Array.isArray(itemsRaw)) return itemsRaw;
    try { return JSON.parse(String(itemsRaw).replace(/'/g, '"')); } catch (e) { }
    if (typeof itemsRaw === 'string') {
      const s = itemsRaw.replace(/^\[|\]$/g, '').trim();
      if (!s) return [];
      return s.split(/\s*,\s*/).slice(0, 50).map(x => x.trim().replace(/^\{|\}$/g, ''));
    }
    return [];
  }

  function renderItensHtml(itens) {
    if (!itens || itens.length === 0) return '<div class="small">Sem itens</div>';
    let html = '<ul>';
    for (const it of itens) {
      if (typeof it === 'string') {
        html += `<li>${escapeHtml(it)}</li>`;
      } else if (typeof it === 'object') {
        const n = it.name || it.nome || JSON.stringify(it);
        const q = it.qtd || it.qty || it.quantity || '';
        const pr = it.price || it.preco || '';
        html += `<li>${escapeHtml(n)} ${q ? ' - x' + q : ''} ${pr ? '- R$ ' + Number(pr).toFixed(2) : ''}</li>`;
      } else {
        html += `<li>${escapeHtml(String(it))}</li>`;
      }
    }
    html += '</ul>';
    return html;
  }

  // novo helper: extrair observação do pedido suportando várias chaves
  function extractNote(p) {
    if (!p) return '';
    return (p.note
      || p.notes
      || p.obs
      || p.observacao
      || p.observacoes
      || p.observações
      || p.observacao_html
      || '') || '';
  }

  function renderCard(p, isHistory = false) {
    const name = (p.nome_cliente || (p.buyerInfo && p.buyerInfo.name) || '—');
    const hora = p.hora_pedido || '';
    const itens = parseItens(p.itens);
    const status = p.status || 'novo';
    const total = Number(p.total || 0).toFixed(2);
    const note = extractNote(p); // <-- pega observação

    const card = document.createElement('div');
    card.className = 'card ' + (status === 'novo' ? 'new' : '');
    card.id = 'pedido-' + p.id;

    card.innerHTML = `
      <div class="meta">
        <div>
          <div class="cliente">${escapeHtml(name)}</div>
          <div class="muted small">${escapeHtml(hora)}</div>
        </div>
        <div style="text-align:right">
          <div class="pill">${escapeHtml(p.pagamento || '')}</div>
          <div style="height:8px"></div>
          <div class="status ${status === 'concluido' ? 'concluido' : 'novo'}">${escapeHtml(status)}</div>
        </div>
      </div>

      <div class="itens">
        ${renderItensHtml(itens)}
      </div>

      ${note ? `<div class="observacao small" style="margin-top:8px;color:#444"><strong>Observações:</strong> ${escapeHtml(note)}</div>` : ''}

      <div class="foot">
        <div>
          <div class="total">R$ ${total}</div>
          <div class="pay small">ID: ${p.id}</div>
        </div>
        <div style="text-align:right">
          ${isHistory
        ? `<button class="btn secondary" data-id="${p.id}" onclick="viewDetails('${p.id}')">Ver</button>
               <button class="btn danger btn-remover" data-id="${p.id}">Remover</button>`
        : `<button class="btn-concluir" data-id="${p.id}">Concluir</button>`}
        </div>
      </div>
    `;
    return card;
  }

  function updateViews() {
    const filter = (filterInput?.value || '').trim().toLowerCase();
    listaEl.innerHTML = '';
    historicoEl.innerHTML = '';
    let ativoCount = 0;
    let histCount = 0;
    const arr = Object.values(pedidos).sort((a, b) => (b.hora_pedido || '').localeCompare(a.hora_pedido || ''));
    for (const p of arr) {
      const status = (p.status || 'novo');
      const hay = ((p.nome_cliente || '') + ' ' + JSON.stringify(p.itens || '') + ' ' + status + ' ' + (p.hora_pedido || '') + ' ' + (extractNote(p) || '')).toLowerCase();
      if (filter && !hay.includes(filter)) continue;
      if (status === 'concluido') {
        const card = renderCard(p, true);
        historicoEl.appendChild(card);
        histCount++;
      } else {
        const card = renderCard(p, false);
        listaEl.appendChild(card);
        ativoCount++;
      }
    }
    emptyEl.style.display = ativoCount === 0 ? 'block' : 'none';
    emptyHist.style.display = histCount === 0 ? 'block' : 'none';
    
    // Recalcular estatísticas quando houver mudanças nos pedidos
    // Verificar se a aba de estatísticas está visível antes de recalcular
    const statsSection = document.getElementById('statsSection');
    if (statsSection && statsSection.style.display !== 'none') {
      calcularEstatisticas();
    }

    // attach concluir events
    document.querySelectorAll('.btn-concluir').forEach(btn => {
      btn.onclick = () => {
        const id = btn.getAttribute('data-id');
        if (!confirm('Concluir pedido ' + id + ' ?')) return;
        socket.emit('concluir_pedido', { id });
        showToast('Solicitado concluir pedido ' + id);
        btn.disabled = true;
        btn.textContent = 'Concluindo...';
      };
    });

    // attach remover events (histórico)
    // attach remover events (histórico) - pede confirmação e chama API DELETE
    document.querySelectorAll('.btn-remover').forEach(btn => {
      btn.onclick = async () => {
        const id = btn.getAttribute('data-id');
        if (!confirm('Remover pedido ' + id + ' do histórico permanentemente? (Isto APAGA do arquivo)')) return;
        try {
          btn.disabled = true;
          btn.textContent = 'Removendo...';
          const base = SERVER_URL || '';
          const res = await fetch((base + '/api/orders/' + encodeURIComponent(id)).replace('//api', '/api'), {
            method: 'DELETE',
          });
          if (!res.ok) {
            const body = await res.json().catch(() => null);
            throw new Error((body && body.error) ? body.error : 'Erro HTTP ' + res.status);
          }
          // sucesso: remover do mapa local e atualizar view
          delete pedidos[id];
          updateViews();
          showToast('Pedido ' + id + ' removido do histórico');
        } catch (err) {
          console.error('Erro remover pedido:', err);
          showToast('Erro ao remover pedido: ' + (err.message || err), 4000);
          // reset visual do botão
          btn.disabled = false;
          btn.textContent = 'Remover';
        }
      };
    });
  }

  function viewDetails(id) {
    const p = pedidos[id];
    if (!p) return;
    detailTitle.textContent = `Pedido ${id} - ${p.nome_cliente || (p.buyerInfo && p.buyerInfo.name) || ''}`;
    const itens = parseItens(p.itens);
    const total = Number(p.total || 0).toFixed(2);
    const note = extractNote(p);
    const html = `
      <p><strong>Cliente:</strong> ${escapeHtml(p.nome_cliente || (p.buyerInfo && p.buyerInfo.name) || '')}</p>
      <p><strong>Pagamento:</strong> ${escapeHtml(p.pagamento || '')} &nbsp; <strong>Status:</strong> ${escapeHtml(p.status || '')}</p>
      <p><strong>Hora pedido:</strong> ${escapeHtml(p.hora_pedido || '')} &nbsp; <strong>Hora conclusão:</strong> ${escapeHtml(p.hora_conclusao || '')}</p>
      <div style="margin-top:12px">
        <strong>Itens:</strong>
        ${renderItensHtml(itens)}
      </div>
      ${note ? `<p style="margin-top:10px"><strong>Observações:</strong> ${escapeHtml(note)}</p>` : ''}
      <p style="margin-top:10px"><strong>Total:</strong> R$ ${total}</p>
    `;
    detailContent.innerHTML = html;
    detailModal.style.display = 'flex';
    detailModal.setAttribute('aria-hidden', 'false');
  }

  // CSV export (histórico visível)
  function exportCsv() {
    const rows = [];
    // Removido o campo 'id' dos cabeçalhos
    const headers = ['Cliente', 'Itens', 'Total (R$)', 'Forma de Pagamento', 'Status', 'Data do Pedido', 'Data de Conclusão', 'Observações'];
    const nodes = Array.from(historicoEl.querySelectorAll('.card'));
    if (nodes.length === 0) { showToast('Nenhum pedido no histórico visível para exportar', 2000); return; }
    
    for (const node of nodes) {
      const id = node.id.replace('pedido-', '');
      const p = pedidos[id];
      if (!p) continue;
      
      // Formatação dos itens para melhor visualização
      const itensArray = parseItens(p.itens);
      let itensFormatados = '';
      
      if (itensArray.length > 0) {
        itensFormatados = itensArray.map(item => {
          if (typeof item === 'string') {
            return item;
          } else if (typeof item === 'object') {
            const nome = item.name || item.nome || '';
            const qtd = item.qtd || item.qty || item.quantity || '';
            const preco = item.price || item.preco || '';
            return `${nome}${qtd ? ' (x'+qtd+')' : ''}${preco ? ' - R$ '+Number(preco).toFixed(2) : ''}`;
          }
          return String(item);
        }).join('; ');
      }
      
      // Formatação das datas para padrão brasileiro
      const formatarData = (dataStr) => {
        if (!dataStr) return '';
        try {
          const data = new Date(dataStr);
          return data.toLocaleString('pt-BR');
        } catch (e) {
          return dataStr;
        }
      };
      
      const note = extractNote(p);
      
      // Removido o campo ID do array
      rows.push([
        `"${(p.nome_cliente || '').replace(/"/g, '""')}"`,
        `"${itensFormatados.replace(/"/g, '""')}"`,
        `"${Number(p.total || 0).toFixed(2).replace('.', ',')}"`,
        `"${(p.pagamento || '').replace(/"/g, '""')}"`,
        `"${(p.status || '').replace(/"/g, '""')}"`,
        `"${formatarData(p.hora_pedido)}"`,
        `"${formatarData(p.hora_conclusao || '')}"`,
        `"${String(note || '').replace(/"/g, '""')}"`
      ]);
    }
    
    // Adicionar BOM para garantir que o Excel reconheça como UTF-8
    const BOM = '\uFEFF';
    let csv = BOM + headers.join(';') + '\n';
    rows.forEach(r => csv += r.join(';') + '\n');
    
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `historico_pedidos_${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
    showToast('Exportado CSV do histórico');
  }

  // ---------------- Socket.IO ----------------
  const socket = io(SERVER_URL, {
    transports: ['websocket', 'polling'],
    reconnection: true,
    reconnectionAttempts: 9999,
    timeout: 20000
  });

  // debug: loga qualquer evento
  if (socket && socket.onAny) {
    socket.onAny((event, ...args) => {
      console.log('[SOCKET onAny] event=', event, 'args=', args);
    });
  }

  socket.on('connect', () => {
    console.log('Socket conectado (painel) - id:', socket.id);
    if (serverStatus) { serverStatus.textContent = 'Conectado'; serverStatus.style.color = 'green'; }
    showToast('Conectado ao servidor');
    if (Object.keys(pedidos).length === 0) carregarPedidosIniciais();
  });

  socket.on('disconnect', (reason) => {
    console.warn('Socket disconnect (painel):', reason);
    if (serverStatus) { serverStatus.textContent = 'Desconectado'; serverStatus.style.color = '#888'; }
    showToast('Desconectado do servidor', 1500);
  });

  socket.on('connect_error', (err) => { console.error('connect_error:', err); showToast('Erro de conexão'); });
  socket.on('error', (err) => console.error('socket error:', err));

  // eventos principais
  socket.on('pedido_recebido', data => {
    console.log('painel.js: pedido_recebido ->', data);
    try {
      // garante id como string/number
      const id = data.id;
      pedidos[id] = data;
      updateViews();
      try { new Audio('data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAESsAACJWAAACABAAZGF0YQAAAAA=').play(); } catch (e) { }
      showToast('Pedido novo: ' + (data.nome_cliente || data.buyerInfo?.name || ''));
    } catch (e) {
      console.error('Erro processando pedido_recebido:', e, data);
    }
  });

  socket.on('pedido_concluido', data => {
    console.log('painel.js: pedido_concluido ->', data);
    const id = data.id;
    if (id in pedidos) { pedidos[id].status = 'concluido'; pedidos[id].hora_conclusao = new Date().toISOString(); }
    else { carregarPedidosIniciais(); }
    updateViews();
    showToast('Pedido ' + id + ' concluído');
  });

  socket.on('concluir_ok', data => {
    console.log('concluir_ok ->', data);
    const id = data.id;
    if (id in pedidos) { pedidos[id].status = 'concluido'; pedidos[id].hora_conclusao = new Date().toISOString(); }
    updateViews();
    showToast('Conclusão confirmada: ' + id);
  });

  socket.on('concluir_err', data => {
    console.log('concluir_err ->', data);
    showToast('Erro ao concluir: ' + (data.msg || ''), 3000);
    carregarPedidosIniciais();
  });

  socket.on('pedido_removido', data => {
    console.log('pedido_removido ->', data);
    try {
      const id = data.id;
      if (id in pedidos) {
        delete pedidos[id];
        updateViews();
        showToast('Pedido ' + id + ' removido (servidor)');
      }
    } catch (e) {
      console.warn('Erro processando pedido_removido:', e, data);
    }
  });

  // ---------------- API / util ----------------
  async function carregarPedidosIniciais() {
    try {
      const base = SERVER_URL || '';
      const res = await fetch((base + '/api/pedidos').replace('//api', '/api'));
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const arr = await res.json();
      arr.forEach(p => { pedidos[p.id] = p; });
      updateViews();
    } catch (e) {
      console.warn('Não foi possível carregar pedidos iniciais:', e);
    }
  }

  // UI handlers
  refreshBtn?.addEventListener('click', () => { carregarPedidosIniciais(); showToast('Atualizando pedidos...'); });
  filterInput?.addEventListener('input', () => updateViews());
  clearFilterBtn?.addEventListener('click', () => { if (filterInput) filterInput.value = ''; updateViews(); });
  exportCsvBtn?.addEventListener('click', exportCsv);

  // Função para calcular estatísticas
  function calcularEstatisticas() {
    const pedidosConcluidos = Object.values(pedidos).filter(p => p.status === 'concluido');
    const totalPedidos = pedidosConcluidos.length;
    let totalVendas = 0;
    let totalItens = 0;
    
    // Contagem de produtos
    const produtosCount = {};
    // Contagem de formas de pagamento
    const pagamentoCount = {};
    
    pedidosConcluidos.forEach(pedido => {
      // Somar total de vendas
      const valorPedido = Number(pedido.total || 0);
      totalVendas += valorPedido;
      
      // Contar forma de pagamento
      const pagamento = pedido.pagamento || 'Não especificado';
      pagamentoCount[pagamento] = (pagamentoCount[pagamento] || 0) + 1;
      
      // Contar produtos e itens
      const itens = parseItens(pedido.itens);
      totalItens += itens.length;
      
      itens.forEach(item => {
        let nomeProduto = '';
        let quantidade = 1;
        
        if (typeof item === 'string') {
          nomeProduto = item;
        } else if (typeof item === 'object') {
          nomeProduto = item.name || item.nome || JSON.stringify(item);
          quantidade = Number(item.qtd || item.qty || item.quantity || 1);
        }
        
        if (nomeProduto) {
          produtosCount[nomeProduto] = (produtosCount[nomeProduto] || 0) + quantidade;
        }
      });
    });
    
    // Calcular ticket médio
    const ticketMedio = totalPedidos > 0 ? totalVendas / totalPedidos : 0;
    
    // Ordenar produtos mais vendidos
    const produtosOrdenados = Object.entries(produtosCount)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10); // Top 10
    
    // Ordenar formas de pagamento
    const pagamentosOrdenados = Object.entries(pagamentoCount)
      .sort((a, b) => b[1] - a[1]);
    
    // Atualizar elementos na interface
    document.getElementById('totalPedidos').textContent = totalPedidos;
    document.getElementById('totalVendas').textContent = `R$ ${totalVendas.toFixed(2).replace('.', ',')}`;
    document.getElementById('ticketMedio').textContent = `R$ ${ticketMedio.toFixed(2).replace('.', ',')}`;
    document.getElementById('totalItens').textContent = totalItens;
    
    // Renderizar lista de produtos mais vendidos
    const topProdutosEl = document.getElementById('topProdutos');
    if (topProdutosEl) {
      topProdutosEl.innerHTML = '';
      if (produtosOrdenados.length === 0) {
        topProdutosEl.innerHTML = '<div class="small muted">Nenhum produto vendido ainda.</div>';
      } else {
        produtosOrdenados.forEach(([nome, qtd]) => {
          const item = document.createElement('div');
          item.className = 'stats-list-item';
          item.innerHTML = `
            <div class="stats-list-name">${escapeHtml(nome)}</div>
            <div class="stats-list-value">${qtd} unid.</div>
          `;
          topProdutosEl.appendChild(item);
        });
      }
    }
    
    // Renderizar formas de pagamento
    const formaPagamentoEl = document.getElementById('formaPagamento');
    if (formaPagamentoEl) {
      formaPagamentoEl.innerHTML = '';
      if (pagamentosOrdenados.length === 0) {
        formaPagamentoEl.innerHTML = '<div class="small muted">Nenhum pagamento registrado.</div>';
      } else {
        pagamentosOrdenados.forEach(([forma, qtd]) => {
          const item = document.createElement('div');
          item.className = 'stats-list-item';
          item.innerHTML = `
            <div class="stats-list-name">${escapeHtml(forma)}</div>
            <div class="stats-list-value">${qtd} pedidos</div>
          `;
          formaPagamentoEl.appendChild(item);
        });
      }
    }
  }
  
  // Gerenciamento de abas
  const tabStats = document.getElementById('tab-stats');
  
  tabAtivos?.addEventListener('click', () => {
    tabAtivos.classList.add('active'); 
    tabHistorico.classList.remove('active');
    tabStats.classList.remove('active');
    document.getElementById('ativosSection').style.display = '';
    document.getElementById('historicoSection').style.display = 'none';
    document.getElementById('statsSection').style.display = 'none';
  });
  
  tabHistorico?.addEventListener('click', () => {
    tabHistorico.classList.add('active'); 
    tabAtivos.classList.remove('active');
    tabStats.classList.remove('active');
    document.getElementById('ativosSection').style.display = 'none';
    document.getElementById('historicoSection').style.display = '';
    document.getElementById('statsSection').style.display = 'none';
  });
  
  tabStats?.addEventListener('click', () => {
    tabStats.classList.add('active');
    tabAtivos.classList.remove('active');
    tabHistorico.classList.remove('active');
    document.getElementById('ativosSection').style.display = 'none';
    document.getElementById('historicoSection').style.display = 'none';
    document.getElementById('statsSection').style.display = '';
    calcularEstatisticas(); // Calcular estatísticas ao abrir a aba
  });

  detailClose?.addEventListener('click', () => { detailModal.style.display = 'none'; detailModal.setAttribute('aria-hidden', 'true'); });
  detailModal?.addEventListener('click', (e) => { if (e.target === detailModal) { detailModal.style.display = 'none'; detailModal.setAttribute('aria-hidden', 'true'); } });

  // helper for onclick in generated buttons
  window.viewDetails = viewDetails;

  // inicial
  carregarPedidosIniciais();
  updateViews();
}); // DOMContentLoaded end
