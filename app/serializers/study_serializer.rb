class StudySerializer < PCSSerializer
  attributes :title, :description, :experimentalists
  attribute :person_responsible_id do
    object.person_responsible_id.to_s
  end

  has_many :people
  has_many :projects
  has_many :investigations
 has_many :assays
  has_many :data_files
  has_many :models
  has_many :sops
  has_many :publications

end
