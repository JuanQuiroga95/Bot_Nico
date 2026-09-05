import test from 'node:test';
import assert from 'node:assert/strict';
import { createKeywordMatcher } from '../keywords.js';
test('detecta productos y consultas comerciales con tildes, plurales y puntuación', () => {
  const { matches, terms } = createKeywordMatcher();
  assert.ok(terms.length > 200);
  for (const message of [
    '¿Tienen DETERGENTES?', 'Necesito cloro y esponjas', 'Trapos de piso por mayor',
    'JABÓN líquido', 'Pasta para manos', 'suavizantes para la ropa', '¿Me pasás la lista?',
    'PRECIOS por favor', '¿Hacen envíos?', '¿Cuál es la dirección?', '¿Cuál es el horario?',
    'Necesito bolsas de residuos', '¿Tenés lavandina?', 'Limpiá-vidrios', 'Microfibras y mopas',
    '¿Aceptan transferencia?', 'Papel higiénico', '¿Hacen recargas?',
  ]) assert.equal(matches(message), true, message);
});
test('evita coincidencias dentro de palabras y admite términos adicionales', () => {
  const { matches } = createKeywordMatcher('ultralimpio, fórmula especial, ,C++');
  assert.equal(matches('¿Tenés ultralimpios?'), true);
  assert.equal(matches('Busco FORMULA ESPECIAL'), true);
  assert.equal(matches('Hola, buen día'), false);
  assert.equal(matches('Estoy en el cloroplasto'), false);
  assert.equal(matches('La escalada estuvo buena'), false);
  assert.equal(matches(null), false);
});
