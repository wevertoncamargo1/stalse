const CITY_NAMES: Record<string, string> = {
  aracaju: 'Aracaju',
  'sao leopoldo': 'São Leopoldo',
  belem: 'Belém',
  'belo horizonte': 'Belo Horizonte',
  brasilia: 'Brasília',
  'campo grande': 'Campo Grande',
  campinas: 'Campinas',
  cuiaba: 'Cuiabá',
  curitiba: 'Curitiba',
  florianopolis: 'Florianópolis',
  fortaleza: 'Fortaleza',
  goiania: 'Goiânia',
  'joao pessoa': 'João Pessoa',
  'juiz de fora': 'Juiz de Fora',
  jundiai: 'Jundiaí',
  maceio: 'Maceió',
  manaus: 'Manaus',
  'nova iguacu': 'Nova Iguaçu',
  niteroi: 'Niterói',
  natal: 'Natal',
  'porto alegre': 'Porto Alegre',
  paranavai: 'Paranavaí',
  piracicaba: 'Piracicaba',
  'pocos de caldas': 'Poços de Caldas',
  recife: 'Recife',
  'rio branco': 'Rio Branco',
  'rio de janeiro': 'Rio de Janeiro',
  salvador: 'Salvador',
  'sao bernardo do campo': 'São Bernardo do Campo',
  'sao carlos': 'São Carlos',
  'sao jose dos campos': 'São José dos Campos',
  'sao jose do rio preto': 'São José do Rio Preto',
  'sao luis': 'São Luís',
  'sao paulo': 'São Paulo',
  'sao goncalo': 'São Gonçalo',
  'santo andre': 'Santo André',
  'foz do iguacu': 'Foz do Iguaçu',
  guaruja: 'Guarujá',
  ibate: 'Ibaté',
  'vargem grande do sul': 'Vargem Grande do Sul',
  'sao jose dos pinhais': 'São José dos Pinhais',
  'santa barbara d oeste': 'Santa Bárbara d’Oeste',
  'sao caetano do sul': 'São Caetano do Sul',
  'sao vicente': 'São Vicente',
  taubate: 'Taubaté',
  teresina: 'Teresina',
  'ribeirao preto': 'Ribeirão Preto',
  maringa: 'Maringá',
  uberlandia: 'Uberlândia',
  vitoria: 'Vitória',
};

export function formatCity(value: string): string {
  const normalized = value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('pt-BR');
  if (CITY_NAMES[normalized]) return CITY_NAMES[normalized];
  return value.toLocaleLowerCase('pt-BR').split(/([\s-]+)/).map((part) => {
    if (/^[\s-]+$/.test(part)) return part;
    if (['da', 'das', 'de', 'do', 'dos', 'e'].includes(part)) return part;
    return part.charAt(0).toLocaleUpperCase('pt-BR') + part.slice(1);
  }).join('');
}
