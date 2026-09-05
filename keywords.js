// Productos e intención comercial. KEYWORDS_EXTRA permite sumar términos separados por coma.
export const CLEANING_KEYWORDS = [
    'limpieza', 'limpiador', 'limpiadora', 'limpiapisos', 'limpia pisos', 'limpia piso',
    'detergente', 'lavavajilla', 'lavavajillas', 'lavaplatos', 'jabon', 'jabon liquido',
    'jabon blanco', 'jabon en polvo', 'jabon de ropa', 'jabon para ropa', 'jabon neutro',
    'jabon potasico', 'jabon de coco', 'pan de jabon', 'polvo para lavar',
    'lavandina', 'cloro', 'hipoclorito', 'desinfectante', 'sanitizante', 'sanitizador',
    'amonio', 'amonio cuaternario', 'antibacterial', 'bactericida', 'germicida',
    'alcohol', 'alcohol en gel', 'alcohol etilico', 'alcohol isopropilico',
    'suavizante', 'enjuague', 'perfumina', 'perfume textil', 'perfume para ropa',
    'aromatizante', 'aromatizador', 'ambientador', 'desodorante', 'desodorizante',
    'esencia', 'fragancia', 'difusor', 'repuesto', 'aerosol', 'neutralizador',
    'desengrasante', 'desengrasador', 'desengrasante industrial', 'desengrasante de motor',
    'antigrasa', 'quita grasa', 'quitagrasa', 'antisarro', 'sarro', 'desincrustante',
    'quitamanchas', 'quita manchas', 'blanqueador', 'blanqueante', 'quitamanchas textil',
    'limpiavidrios', 'limpia vidrios', 'limpia cristales', 'multisuperficie', 'multiuso',
    'limpiamuebles', 'limpia muebles', 'lustramuebles', 'lustra muebles', 'lustrador',
    'silicona', 'cera', 'cera liquida', 'cera para pisos', 'autobrillo', 'brillo',
    'removedor', 'removedor de cera', 'limpia horno', 'limpiahornos', 'limpia hornos',
    'limpia inodoro', 'limpiainodoros', 'pastilla para inodoro', 'pastilla sanitaria',
    'gel sanitario', 'limpia bano', 'limpiabanos', 'destapacanos', 'destapa canos',
    'soda caustica', 'acido muriatico', 'acido citrico', 'bicarbonato', 'vinagre',
    'agua oxigenada', 'percarbonato', 'sal de limon', 'desoxidante', 'antioxido',
    'limpia alfombra', 'limpia tapizado', 'limpiatapizados', 'shampoo', 'champu',
    'espuma', 'pasta', 'pasta de limpieza', 'pasta para manos', 'crema limpiadora',
    'crema de limpieza', 'cremoso', 'abrasivo', 'pulidor', 'pulimento', 'desengomante',
    'esponja', 'esponjita', 'esponjon', 'virulana', 'lana de acero', 'fibra',
    'estropajo', 'trapo', 'trapos', 'trapo de piso', 'trapos de piso', 'trapo rejilla',
    'rejilla', 'franela', 'microfibra', 'pano', 'pano de piso', 'paño', 'bayeta',
    'mopa', 'mop', 'lampazo', 'fregona', 'escoba', 'escobillon', 'escobita',
    'cepillo', 'cepillo de bano', 'sopapa', 'secador', 'secador de piso', 'secavidrios',
    'limpiaventanas', 'plumero', 'recogedor', 'pala', 'palita', 'cabo', 'palo',
    'balde', 'cubo', 'fuenton', 'palangana', 'rociador', 'pulverizador', 'atomizador',
    'gatillo', 'dispenser', 'dispensador', 'dosificador', 'embudo', 'guante',
    'guantes de goma', 'guantes de latex', 'guantes de nitrilo', 'delantal',
    'bolsa', 'bolsa de residuos', 'bolsas de residuos', 'bolsa de basura', 'consorcio',
    'residuo', 'basura', 'cesto', 'basurero', 'bolson', 'bolsita',
    'papel higienico', 'papel de cocina', 'rollo de cocina', 'rollos de cocina',
    'rollo industrial', 'bobina', 'servilleta', 'toalla de papel', 'toalla intercalada',
    'toallita', 'higiene', 'sanitario', 'higienizante', 'limpieza institucional',
    'bidon', 'envase', 'botella', 'tambor', 'litro', 'litros', 'granel',
    'recarga', 'recargar', 'retornable', 'concentrado', 'dilucion', 'diluir',
    'deter', 'suavi', 'lavandi', 'jabon ariel', 'ala', 'skip', 'ace', 'cif',
    'ayudin', 'vim', 'odex', 'poett', 'poet', 'blem', 'lysoform', 'procenex',
    'magistral', 'zorro', 'drive', 'comfort', 'vivere', 'downy',
    'limpieza de pileta', 'pileta', 'piscina', 'alguicida', 'clarificador',
    'floculante', 'cloro granulado', 'cloro liquido', 'pastilla de cloro',
    'lavado de auto', 'lavadero', 'shampoo para auto', 'revividor', 'silicona liquida',
    'insecticida', 'repelente', 'naftalina', 'antipolilla',
    'combo', 'kit', 'pack', 'bolson de limpieza', 'producto', 'articulo',
    'lista', 'listado', 'precio', 'catalogo', 'presupuesto', 'cotizacion',
    'costo', 'cuanto cuesta', 'cuanto sale', 'cuanto vale', 'valor',
    'oferta', 'promo', 'promocion', 'descuento', 'mayorista', 'minorista',
    'mayor', 'menor', 'reventa', 'revendedor', 'distribuidor', 'distribuidora',
    'fabrica', 'local', 'negocio', 'sucursal', 'retiro', 'retirar', 'retira',
    'delivery', 'domicilio', 'envio', 'enviar', 'entrega', 'reparto', 'reparten',
    'zona', 'ubicacion', 'direccion', 'horario', 'abren', 'cierran', 'abierto',
    'stock', 'disponible', 'disponibilidad', 'pedido', 'pedir', 'compra', 'comprar',
    'pago', 'pagar', 'transferencia', 'efectivo', 'tarjeta', 'debito', 'credito',
    'cuota', 'factura', 'cbu', 'alias', 'mercado pago', 'mercadopago',
    'minimo de compra', 'compra minima', 'venta', 'venden', 'vendes',
];

export function normalizeText(value) {
    return String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

export function createKeywordMatcher(extra = '') {
    const terms = [...new Set([...CLEANING_KEYWORDS, ...extra.split(',')].map(normalizeText).filter(Boolean))];
    // Límites de palabra evitan que "cloro" coincida dentro de otra palabra.
    const expression = new RegExp('(?:^|\\s)(?:' + terms.join('|') + ')(?:s|es)?(?=\\s|$)', 'i');
    return { terms, matches: value => expression.test(normalizeText(value)) };
}
