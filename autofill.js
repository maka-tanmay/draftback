(function (root) {
  "use strict";
  const fields = {
    title: "Title", firstName: "First name", middleName: "Middle name / initial", lastName: "Last name",
    fullName: "Full name", email: "Email", phone: "Phone", homePhone: "Home phone", workPhone: "Work phone",
    fax: "Fax", website: "Website", linkedin: "LinkedIn", company: "Company", jobTitle: "Job title",
    address1: "Address line 1", address2: "Address line 2", city: "City", state: "State / province",
    postalCode: "Postal / ZIP code", country: "Country", birthDate: "Date of birth", birthPlace: "Place of birth",
    school: "School / university", degree: "Degree", fieldOfStudy: "Field of study", github: "GitHub URL",
    nationality: "Nationality", location: "Current location (city, region)", county: "County"
  };
  const norm = value => String(value || "").normalize('NFKD').replace(/\p{M}/gu,'').replace(/([a-z])([A-Z])/g, "$1 $2").toLowerCase().replace(/[^a-z0-9]/g, "");
  const aliases = {
    title: ["title", "salutation", "honorificprefix"], firstName: ["firstname", "givenname", "frstname", "fname", "first"],
    middleName: ["middlename", "middleinitial", "middlei", "additionalname"], lastName: ["lastname", "surname", "familyname", "lname", "last"],
    fullName: ["fullname", "yourname", "name", "applicantname"], email: ["email", "emailaddress", "emailadr", "emailid", "contactemailaddress", "confirmyouremail", "confirmemail", "confirmemailaddress"],
    phone: ["phone", "phonenumber", "telephone", "telephonenumber", "contacttelephonenumber", "tel", "mobile", "mobilenumber", "mobilephone", "cellphone", "cellphon", "telephonemobile"],
    homePhone: ["homephone", "homephon"], workPhone: ["workphone", "worktelephone", "workphon"], fax: ["fax", "faxphone"],
    website: ["website", "weburl", "personalwebsite", "portfolio", "portfoliourl", "url"], linkedin: ["linkedin", "linkedinurl", "linkedinprofile", "linkedinprofilelink"],
    github: ["github", "githuburl", "githubprofile"], nationality: ["nationality"], location: ["currentlocation", "location"], county: ["county", "addresscounty"],
    company: ["company", "companyname", "businessname", "organization", "organisation", "org", "employer", "currentemployer", "currentcompany"],
    jobTitle: ["jobtitle", "position", "occupation", "organizationtitle", "currentjobtitle"],
    address1: ["address", "address1", "addressline1", "streetaddress", "street", "street1"],
    address2: ["address2", "addressline2", "apartment", "suite", "street2"], city: ["city", "town", "adrcity", "addresslevel2", "townorcity", "towncity", "addresstown", "locationcity"],
    state: ["state", "province", "stateprovince", "adrstate", "addresslevel1"],
    postalCode: ["zip", "zipcode", "postalcode", "postcode", "addrzip", "pincode", "addresspostcode"], country: ["country", "countryname", "countryyoulivein", "whichcountryareyoucurrentlybasedin", "countryofresidence"],
    birthDate: ["dateofbirth", "birthdate", "dob", "bday"], birthMonth: ["birthmonth", "bdaymonth", "dobmonth", "mm"],
    birthDay: ["birthday", "bdayday", "dobday", "dd"], birthYear: ["birthyear", "bdayyear", "dobyear", "yy"],
    birthPlace: ["birthplace", "placeofbirth", "birthpl"], school: ["school", "schoolname", "university", "college", "institution", "schooluniversity"],
    degree: ["degree", "educationdegree"], fieldOfStudy: ["fieldofstudy", "major", "discipline"]
  };
  const lookup = new Map(Object.entries(aliases).flatMap(([key, names]) => names.map(name => [name, key])));
  function classify(hints) {
    const text = hints.map(value => norm(String(value || "").replace(/\((?:optional|required|max[^)]*|dd[^)]*|mm[^)]*|yyyy[^)]*)\)/gi, "")).replace(/^\d+(?=[a-z])/, ""));
    if (text.some(s => /password|passwd|creditcard|cardnumber|cardverification|ccnumber|ccexp|ccuname|ccissuer|cccstsvc|cvc|cvv|socialsecurity|persssn|passport|drivlic|driverlicense|routingnumber|bankaccount|onetimecode|verificationcode|captcha|username|userid|loginid|hintanswer|securityanswer|emergencycontact|father|mother|spouse|refereename|referencecontact/.test(s) || s.startsWith("cc"))) return null;
    for (const hint of text) if (lookup.has(hint)) return lookup.get(hint);
    for (const hint of text) {
      const cleaned = hint.replace(/^(?:pleaseenter|enteryour|enter|your)/, "").replace(/(?:optional|required)$/, "");
      if (lookup.has(cleaned)) return lookup.get(cleaned);
      const scoped = cleaned.replace(/^(?:candidate|applicant|personal|contact|profile)(?:details)?/, '');
      if (lookup.has(scoped)) return lookup.get(scoped);
    }
    return null;
  }
  function sanitize(profile) {
    return Object.fromEntries(Object.keys(fields).flatMap(key => {
      const value = typeof profile?.[key] === "string" ? profile[key].trim().slice(0, 500) : "";
      return value && (key !== 'birthDate' || validDate(value)) ? [[key, value]] : [];
    }));
  }
  function validDate(value) {
    if(!/^\d{4}-\d{2}-\d{2}$/.test(value))return false;
    const date=new Date(value+'T00:00:00Z');
    return Number.isFinite(date.getTime()) && date.toISOString().slice(0,10)===value;
  }
  function countryName(value) {
    const aliases={us:'United States',usa:'United States',unitedstatesofamerica:'United States',uk:'United Kingdom',gbr:'United Kingdom',greatbritain:'United Kingdom',ind:'India'};
    if(aliases[norm(value)])return aliases[norm(value)];
    return /^[a-z]{2}$/i.test(value) ? new Intl.DisplayNames(['en'],{type:'region'}).of(value.toUpperCase()) : value;
  }
  function valueFor(profile, key) {
    if (key === "fullName") return profile.fullName || [profile.firstName, profile.middleName, profile.lastName].filter(Boolean).join(" ");
    if (key === "homePhone") return profile.homePhone || profile.phone;
    if (key === "location") return profile.location || [profile.city, profile.state].filter(Boolean).join(", ");
    const date = /^(\d{4})-(\d{2})-(\d{2})$/.exec(profile.birthDate || "");
    if (date && key === "birthYear") return date[1];
    if (date && key === "birthMonth") return date[2];
    if (date && key === "birthDay") return date[3];
    return profile[key] || "";
  }
  root.DraftBackAutofill = { fields, norm, classify, sanitize, valueFor, validDate, countryName };
  if (typeof module !== "undefined") module.exports = root.DraftBackAutofill;
})(globalThis);
