class AssaySerializer < PCSSerializer
  attributes :title, :description
  attribute :assay_class do
    { title: object.assay_class.title,
      key: object.assay_class.key,
      description: object.assay_class.description }
  end

  attribute :assay_type do
    { label:  object.assay_type_label,
      uri: object.assay_type_uri }
  end

  attribute :technology_type do
    { label: object.technology_type_label,
      uri: object.technology_type_uri }
  end

  has_many :organisms, include_data:true
  has_many :assay_organisms, include_data:true

  has_many :people
  has_many :projects
  has_many :institutions
  has_many :investigations
  has_many :studies
  has_many :data_files
  has_many :models
  has_many :sops
  has_many :publications
  has_many :strains
  has_many :samples

end
