alter type public.ravitaillement_statut
add value if not exists 'EN_COURS'
after 'VALIDE';
