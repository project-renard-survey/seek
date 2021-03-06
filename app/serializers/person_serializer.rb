require 'digest/sha1'
class PersonSerializer < AvatarObjSerializer
  attributes :title, :description,
             :first_name, :last_name,
             :web_page,  :orcid
  attribute :email do
    Digest::SHA1.hexdigest(object.email)
  end
  attribute :expertise do
    serialize_annotations(object, context="expertise")
  end
  attribute :tools do
    serialize_annotations(object, context="tool")
  end
  has_many :work_groups, include_data:true

  has_many :projects
  has_many :institutions
  has_many :investigations
  has_many :studies
  has_many :assays
  has_many :data_files
  has_many :models
  has_many :sops
  has_many :publications
  has_many :presentations
  has_many :events
  has_many :samples


end
